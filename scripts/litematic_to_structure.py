#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""litematic -> DFD Wiki 结构 JSON 转换器（仅依赖 Python 标准库，自包含）。

用法:
    python scripts/litematic_to_structure.py <输入.litematic> <输出.json> [--name 名称]

示例:
    python scripts/litematic_to_structure.py "NTW_Push.litematic" "static/structures/NTW/NTW_Push.json"

说明:
    - 输出格式沿用 static/structures/*.json：{"name","pattern","blocks"}。
    - 每个方块写 "type"（原始方块 id，作为 pattern 的键）以及内联的
      "block"（推导出的本站模型 id）、"facing"/"axis"；不依赖 pattern 也能直接渲染。
    - "pattern" 按本次实际出现的 type 去重生成占位键，值为 {"item": ""}：
      StructureViewer 的预设值类型是 BlockDef，没有 "id" 字段；本站物品库 id 的字段名是
      "item"，模型 id 的字段名是 "block"。占位用 "item" 是因为它是“本站物品 id”的入口，
      填了会自动展开名称/链接/颜色；留空（""）时会被 applyItem 跳过，回退到方块内联的
      block，不会变成灰色。viewer 会把 pattern 当 palette 的等价预设表使用。
    - 空气方块不输出；litematic 的 TileEntities/Entities 本站结构没有对应的数据模型，
      只统计数量并在报告里列出，不写入 JSON。
    - 多 region 会按 world 坐标展平；重叠格按文件中的 region 顺序“后者覆盖前者”，
      并在报告里给出覆盖格数。
    - 负 Size 按 Litematica 规则处理（负号表示从 Position 向负方向延伸）。

退出码: 0 成功；1 参数/文件错误。
"""

import argparse
import gzip
import json
import os
import struct
import sys
from collections import Counter, OrderedDict
from pathlib import Path

# ----------------------------------------------------------------------------
# 最小 NBT 读取器（大端；gzip 透明解压）
# ----------------------------------------------------------------------------

TAG_END = 0
TAG_BYTE = 1
TAG_SHORT = 2
TAG_INT = 3
TAG_LONG = 4
TAG_FLOAT = 5
TAG_DOUBLE = 6
TAG_BYTE_ARRAY = 7
TAG_STRING = 8
TAG_LIST = 9
TAG_COMPOUND = 10
TAG_INT_ARRAY = 11
TAG_LONG_ARRAY = 12


class NbtError(Exception):
    pass


def _read_name(data, pos):
    (length,) = struct.unpack_from(">H", data, pos)
    pos += 2
    return data[pos:pos + length].decode("utf-8", "replace"), pos + length


def _read_payload(data, pos, tag_type):
    if tag_type == TAG_BYTE:
        return struct.unpack_from(">b", data, pos)[0], pos + 1
    if tag_type == TAG_SHORT:
        return struct.unpack_from(">h", data, pos)[0], pos + 2
    if tag_type == TAG_INT:
        return struct.unpack_from(">i", data, pos)[0], pos + 4
    if tag_type == TAG_LONG:
        return struct.unpack_from(">q", data, pos)[0], pos + 8
    if tag_type == TAG_FLOAT:
        return struct.unpack_from(">f", data, pos)[0], pos + 4
    if tag_type == TAG_DOUBLE:
        return struct.unpack_from(">d", data, pos)[0], pos + 8
    if tag_type == TAG_BYTE_ARRAY:
        (n,) = struct.unpack_from(">i", data, pos)
        pos += 4
        return list(struct.unpack_from(">%db" % n, data, pos)), pos + n
    if tag_type == TAG_STRING:
        return _read_name(data, pos)
    if tag_type == TAG_LIST:
        (item_type,) = struct.unpack_from(">b", data, pos)
        (n,) = struct.unpack_from(">i", data, pos + 1)
        pos += 5
        items = []
        for _ in range(n):
            item, pos = _read_payload(data, pos, item_type)
            items.append(item)
        return items, pos
    if tag_type == TAG_COMPOUND:
        out = OrderedDict()
        while True:
            t = data[pos]
            pos += 1
            if t == TAG_END:
                return out, pos
            name, pos = _read_name(data, pos)
            out[name], pos = _read_payload(data, pos, t)
    if tag_type == TAG_INT_ARRAY:
        (n,) = struct.unpack_from(">i", data, pos)
        pos += 4
        return list(struct.unpack_from(">%di" % n, data, pos)), pos + 4 * n
    if tag_type == TAG_LONG_ARRAY:
        (n,) = struct.unpack_from(">i", data, pos)
        pos += 4
        return list(struct.unpack_from(">%dq" % n, data, pos)), pos + 8 * n
    raise NbtError("未知 tag 类型 %d @ %d" % (tag_type, pos))


def read_nbt(path):
    """读取 .litematic（gzip 或裸 NBT），返回 root Compound。"""
    raw = Path(path).read_bytes()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    pos = 0
    tag_type = raw[pos]
    pos += 1
    if tag_type != TAG_COMPOUND:
        raise NbtError("root tag 必须是 Compound，实际 %d" % tag_type)
    _, pos = _read_name(raw, pos)
    root, _ = _read_payload(raw, pos, TAG_COMPOUND)
    return root


# ----------------------------------------------------------------------------
# LitematicaBitArray 解码
# ----------------------------------------------------------------------------

MASK64 = (1 << 64) - 1


def bits_needed(palette_size):
    """palette 大小 -> 每项 bit 数（下限 2，不是 4）。"""
    if palette_size <= 2:
        return 2
    return max(2, (palette_size - 1).bit_length())


def decode_bit_array(longs, bits, count):
    """连续比特流展开：LSB-first，允许跨 64 位边界。"""
    out = [0] * count
    if bits == 0:
        return out
    unsigned = [v & MASK64 for v in longs]
    for idx in range(count):
        start = idx * bits
        arr = start >> 6
        off = start & 63
        if off + bits <= 64:
            out[idx] = (unsigned[arr] >> off) & ((1 << bits) - 1)
        else:
            low = (unsigned[arr] >> off) & ((1 << (64 - off)) - 1)
            high = unsigned[arr + 1] << (64 - off)
            out[idx] = (low | high) & ((1 << bits) - 1)
    return out


def _byteswap_long(v):
    u = v & MASK64
    return int.from_bytes(u.to_bytes(8, "big"), "little")


def _state_string(entry):
    name = entry.get("Name") or entry.get("id") or "minecraft:air"
    props = entry.get("Properties") or entry.get("properties") or {}
    if not props:
        return name
    return "%s[%s]" % (name, ",".join("%s=%s" % (k, props[k]) for k in sorted(props)))


class Region:
    def __init__(self, name, raw):
        self.name = name
        self.raw = raw
        pos = raw.get("Position", {"x": 0, "y": 0, "z": 0})
        size = raw.get("Size", {"x": 0, "y": 0, "z": 0})
        self.pos = (int(pos.get("x", 0)), int(pos.get("y", 0)), int(pos.get("z", 0)))
        # Size 允许为负：负号只表示“从 Position 向负方向延伸”
        self.size_raw = (int(size.get("x", 0)), int(size.get("y", 0)), int(size.get("z", 0)))
        self.abs_size = tuple(abs(v) for v in self.size_raw)
        self.palette = [_state_string(e) for e in raw.get("BlockStatePalette", [])]
        self.longs = list(raw.get("BlockStates", []))
        self.volume = self.abs_size[0] * self.abs_size[1] * self.abs_size[2]
        self.tile_entities = list(raw.get("TileEntities", []))
        self.entities = list(raw.get("Entities", []))
        self.pending_block_ticks = list(raw.get("PendingBlockTicks", []))
        self.pending_fluid_ticks = list(raw.get("PendingFluidTicks", []))
        self.indices, self.bits, self.endian = self._decode()

    def _decode(self):
        """自动探测位宽/字节序；标准文件是大端，少数工具会写成小端。"""
        best = None
        pal_len = len(self.palette)
        base_bits = bits_needed(pal_len)
        tried = [base_bits] + [b for b in range(2, 9) if b != base_bits]
        for bits in tried:
            if (self.volume * bits + 63) // 64 != len(self.longs):
                continue
            for endian in ("big", "little"):
                longs = self.longs if endian == "big" else [_byteswap_long(v) for v in self.longs]
                ids = decode_bit_array(longs, bits, self.volume)
                bad = sum(1 for v in ids if v >= pal_len)
                if best is None or bad < best[0]:
                    best = (bad, bits, endian, ids)
        if best is None:
            raise NbtError("region %r: 无法由 BlockStates 长度反推合法位宽" % self.name)
        bad, bits, endian, ids = best
        if bad:
            raise NbtError("region %r: palette 索引越界 %d 个（文件可能损坏）" % (self.name, bad))
        return ids, bits, endian

    def local_to_world(self, lx, ly, lz):
        px, py, pz = self.pos
        sx, sy, sz = self.size_raw
        x = px + lx if sx >= 0 else px + sx + 1 + lx
        y = py + ly if sy >= 0 else py + sy + 1 + ly
        z = pz + lz if sz >= 0 else pz + sz + 1 + lz
        return x, y, z

    def iter_blocks(self):
        ax, ay, az = self.abs_size
        for ly in range(ay):
            for lz in range(az):
                for lx in range(ax):
                    idx = (ly * az + lz) * ax + lx
                    pal = self.indices[idx]
                    yield self.local_to_world(lx, ly, lz) + (self.palette[pal],)


# ----------------------------------------------------------------------------
# blockstate -> 本站模型 id
# ----------------------------------------------------------------------------

AIR_BLOCKS = {
    "minecraft:air",
    "minecraft:cave_air",
    "minecraft:void_air",
    "minecraft:structure_void",
}

CANDLE_WORDS = {"1": "one_candle", "2": "two_candles", "3": "three_candles", "4": "four_candles"}
FACINGS = {"up", "down", "north", "south", "east", "west"}
AXES = {"x", "y", "z"}


def split_state(state):
    if "[" not in state:
        return state, {}
    name, rest = state.split("[", 1)
    props = {}
    for pair in rest.rstrip("]").split(","):
        if "=" in pair:
            k, v = pair.split("=", 1)
            props[k] = v
    return name, props


class ModelMapper:
    def __init__(self, model_dir):
        self.model_dir = Path(model_dir)
        self._cache = {}

    def has(self, model_id):
        if model_id not in self._cache:
            self._cache[model_id] = (self.model_dir / (model_id + ".json")).is_file()
        return self._cache[model_id]

    def resolve(self, state):
        """返回 (模型 id, 说明)；找不到模型时模型 id 为 None。"""
        raw_name, props = split_state(state)
        if raw_name in AIR_BLOCKS:
            return None, "air"
        name = raw_name[10:] if raw_name.startswith("minecraft:") else raw_name
        reasons = []

        # 非 minecraft 命名空间没有对应材质，但仍然输出（由调用方报告）
        if not raw_name.startswith("minecraft:"):
            return None, "非 minecraft 命名空间"

        candidates = []
        lit = props.get("lit") == "true"
        powered = props.get("powered") == "true"

        def push(*names):
            for n in names:
                if n and n not in candidates:
                    candidates.append(n)

        # --- 蜡烛：数量与点燃状态会拆成不同模型 ---
        if name == "candle" or name.endswith("_candle"):
            word = CANDLE_WORDS.get(props.get("candles", "1"), "one_candle")
            base = "%s_%s" % (name, word)
            push(base + "_lit" if lit else base, base, name)
        # --- 蛋糕上的蜡烛 ---
        elif name.endswith("_candle_cake"):
            push(name + "_lit" if lit else name, name)
        # --- 钟：attachment 决定模型 ---
        elif name == "bell":
            attachment = props.get("attachment", "floor")
            push("bell_" + attachment, "bell_floor", "bell")
        # --- 蜂箱 / 蜂巢：honey_level=5 为满蜜模型 ---
        elif name in ("beehive", "bee_nest"):
            push(name + ("_honey" if props.get("honey_level") == "5" else "_empty"), name)
        # --- 半砖：top 用 *_top ---
        elif name.endswith("_slab"):
            push(name + "_top" if props.get("type") == "top" else name, name)
        # --- 楼梯：inner/outer 用独立模型 ---
        elif name.endswith("_stairs"):
            shape = props.get("shape", "straight")
            push(name + "_" + shape if shape in ("inner", "outer") else name, name)
        # --- 活板门 ---
        elif name.endswith("_trapdoor"):
            if props.get("open") == "true":
                push(name + "_open", name + "_top", name + "_bottom", name)
            elif props.get("half") == "top":
                push(name + "_top", name)
            else:
                push(name + "_bottom", name)
        # --- 门 ---
        elif name.endswith("_door"):
            half = "top" if props.get("half") == "top" else "bottom"
            hinge = "right" if props.get("hinge") == "right" else "left"
            model = "%s_%s_%s" % (name, half, hinge)
            if props.get("open") == "true":
                push(model + "_open", model)
            else:
                push(model)
        # --- 栅栏门 ---
        elif name.endswith("_fence_gate"):
            in_wall = props.get("in_wall") == "true"
            is_open = props.get("open") == "true"
            model = name + ("_wall" if in_wall else "") + ("_open" if is_open else "")
            push(model, name)
        # --- 栅栏：本站只能用单模型近似（无法按连接方向拼 multi-part） ---
        elif name.endswith("_fence"):
            push(name + "_inventory", name + "_post", name)
        # --- 墙：同理，post 模型最接近 ---
        elif name.endswith("_wall"):
            push(name + "_post", name + "_inventory", name)
        # --- 玻璃板/铁栏杆：post 表示十字 ---
        elif name.endswith("_pane"):
            push(name + "_post", name)
        # --- 按钮 / 拉杆 ---
        elif name.endswith("_button") or name == "button":
            push(name + "_pressed" if powered else name, name + "_inventory", name)
        elif name == "lever":
            push("lever_on" if powered else "lever", "lever")
        # --- 铁轨 ---
        elif name.endswith("_rail"):
            shape = props.get("shape", "north_south")
            suffix = ""
            if shape in ("ascending_east", "ascending_west"):
                suffix = "_raised_ne"
            elif shape in ("ascending_north", "ascending_south"):
                suffix = "_raised_sw"
            model = name + ("_on" if powered else "") + suffix
            push(model, name + ("_on" if powered else ""), name)

        # --- 通用：点燃变体 ---
        if lit:
            push(name + "_on", name)
        # --- 通用：蜡化/氧化变体（资源包按未蜡化的名字存放） ---
        if not self.has(name) or (lit and not self.has(name + "_on")):
            stripped = name
            for prefix in ("waxed_",):
                if stripped.startswith(prefix):
                    stripped = stripped[len(prefix):]
            if stripped != name:
                push(stripped)
                if lit:
                    push(stripped + "_on")

        push(name)

        for cand in candidates:
            if self.has(cand):
                note = "" if cand == name else "变体模型 %s" % cand
                return cand, note
        return None, "缺少模型 JSON"


def get_facing_axis(props):
    facing = props.get("facing") if props.get("facing") in FACINGS else None
    axis = props.get("axis") if props.get("axis") in AXES else None
    # 红石灯等用 lit，不在这里处理
    return facing, axis


# ----------------------------------------------------------------------------
# 转换主流程
# ----------------------------------------------------------------------------

def convert(input_path, output_path, name=None, model_dir=None):
    root = read_nbt(input_path)
    regions = [Region(k, v) for k, v in (root.get("Regions", {}) or {}).items()]
    if not regions:
        raise NbtError("文件中没有 Regions")

    total_volume = 0
    total_air = 0
    overlaps = 0
    world_blocks = OrderedDict()
    tile_count = 0
    entity_count = 0
    pending_count = 0

    for region in regions:
        total_volume += region.volume
        tile_count += len(region.tile_entities)
        entity_count += len(region.entities)
        pending_count += len(region.pending_block_ticks) + len(region.pending_fluid_ticks)
        for x, y, z, state in region.iter_blocks():
            if state in AIR_BLOCKS:
                total_air += 1
                continue
            key = (x, y, z)
            if key in world_blocks:
                overlaps += 1
            world_blocks[key] = state

    mapper = ModelMapper(model_dir)
    state_counts = Counter(world_blocks.values())
    state_cache = {}
    mapped_models = {}
    used_models = Counter()
    unmapped = Counter()
    block_notes = Counter()
    out_blocks = []

    for (x, y, z), state in sorted(world_blocks.items(), key=lambda kv: (kv[0][1], kv[0][2], kv[0][0])):
        if state not in state_cache:
            model, note = mapper.resolve(state)
            raw_name, props = split_state(state)
            site_type = raw_name[10:] if raw_name.startswith("minecraft:") else raw_name
            facing, axis = get_facing_axis(props)
            state_cache[state] = (model, note, site_type, facing, axis)
            if model is None:
                unmapped[state] = state_counts[state]
            else:
                mapped_models[state] = model
                used_models[model] += state_counts[state]
                if note:
                    block_notes[note] += state_counts[state]

        model, note, site_type, facing, axis = state_cache[state]
        block = OrderedDict()
        block["x"] = int(x)
        block["y"] = int(y)
        block["z"] = int(z)
        block["type"] = site_type
        if model is not None:
            block["block"] = model
        if facing:
            block["facing"] = facing
        if axis:
            block["axis"] = axis
        out_blocks.append(block)

    if name is None:
        meta_name = (root.get("Metadata", {}) or {}).get("Name")
        name = meta_name if meta_name and meta_name != "Unnamed" else Path(output_path).stem

    write_structure(output_path, name, out_blocks, sorted({b["type"] for b in out_blocks}))

    # ---------------- 报告 ----------------
    print("[文件] %s" % input_path)
    print("[版本] dataVersion=%s  format=%s.%s" % (
        root.get("MinecraftDataVersion", "?"),
        root.get("Version", "?"),
        root.get("SubVersion", "?"),
    ))
    print("[区域] %d 个" % len(regions))
    for r in regions:
        print("  - %s  Position=%s  Size=%s(abs %s)  palette=%d  bits=%d  endian=%s" % (
            r.name, r.pos, r.size_raw, r.abs_size, len(r.palette), r.bits, r.endian,
        ))
    print("[体积] %d 格；空气 %d；写出非空气 %d；multi-region 覆盖 %d 格" % (
        total_volume, total_air, len(out_blocks), overlaps,
    ))
    print("[忽略] TileEntity %d 个；Entity %d 个；PendingTicks %d 个（本站结构 JSON 无对应字段）" % (
        tile_count, entity_count, pending_count,
    ))

    print("[映射] 成功 %d 种 blockstate：" % len(mapped_models))
    for model, count in sorted(used_models.items()):
        print("  - %-45s x%d" % (model, count))
    if block_notes:
        print("[近似] 以下 state 用了变体模型（形状/朝向细节可能不完整）：")
        for note, count in sorted(block_notes.items()):
            print("  - %s x%d" % (note, count))

    if unmapped:
        print("[未映射] %d 种 blockstate 没有对应模型，已保留 type、暂不渲染：" % len(unmapped))
        for state, count in sorted(unmapped.items()):
            print("  - %-55s x%d" % (state, count))
    else:
        print("[未映射] 无")

    print("[写出] %s" % output_path)
    return len(out_blocks)


def write_structure(output_path, name, blocks, pattern_keys):
    """按仓库现有风格输出：每个方块一行，pattern 每个 type 一个 item 空占位。"""
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    lines = ["{",
             '  "name": %s,' % json.dumps(name, ensure_ascii=False),
             '  "pattern": {']
    for i, key in enumerate(pattern_keys):
        line = '    %s: {"item": ""}' % json.dumps(key, ensure_ascii=False)
        if i < len(pattern_keys) - 1:
            line += ","
        lines.append(line)
    lines.append("  },")
    lines.append('  "blocks": [')
    for i, b in enumerate(blocks):
        line = "    " + json.dumps(b, ensure_ascii=False, separators=(", ", ": "))
        if i < len(blocks) - 1:
            line += ","
        lines.append(line)
    lines.append("  ]")
    lines.append("}")
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(
        description="把 .litematic 转为 static/structures/*.json",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="示例:\n"
               "  python scripts/litematic_to_structure.py 输入.litematic static/structures/NTW/NTW_Push.json\n"
               "  python scripts/litematic_to_structure.py 输入.litematic out.json --name 我的结构",
    )
    parser.add_argument("input", help="输入 .litematic 文件")
    parser.add_argument("output", help="输出结构 JSON（通常放在 static/structures/ 下）")
    parser.add_argument("--name", help="结构名，默认取输出文件名或 litematic Metadata.Name")
    parser.add_argument(
        "--model-dir",
        default=str(Path(__file__).resolve().parent.parent / "static" / "img" / "Minecraft" / "block"),
        help="方块模型 JSON 目录，默认 static/img/Minecraft/block",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.input):
        print("[错误] 输入文件不存在: %s" % args.input, file=sys.stderr)
        return 1
    if not os.path.isdir(args.model_dir):
        print("[错误] 模型目录不存在: %s" % args.model_dir, file=sys.stderr)
        return 1

    try:
        convert(args.input, args.output, args.name, args.model_dir)
    except (NbtError, ValueError, struct.error) as e:
        print("[错误] %s" % e, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
