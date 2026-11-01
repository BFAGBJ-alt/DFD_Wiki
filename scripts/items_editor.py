#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""items.ts 可视化编辑器

用法:
    python scripts/items_editor.py            # 打开默认的 src/data/items.ts
    python scripts/items_editor.py <文件路径>  # 打开指定文件
    python scripts/items_editor.py --check     # 只做解析/回写的往返校验（不开 GUI）

功能:
    - 左侧列表浏览/搜索物品，右侧编辑 名称 / 贴图 / 3D 模型 / 颜色 / 链接
    - 贴图可点「浏览…」从 static/img/Minecraft 目录树中挑选，带预览
    - 新建、重命名、删除物品
    - 保存时只替换 `export const items = {...}` 这一块，文件其余内容原样保留
    - 保存前自动备份为 items.ts.bak

注意: items 对象内部的注释（如 // ===== 原版材料 =====）在保存后不会保留。
"""

import json
import re
import shutil
import sys
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, simpledialog, ttk

FIELD_ORDER = ["name", "block", "texture", "color", "link", "glint"]
FIELD_LABELS = {
    "name": "名称",
    "block": "3D 模型",
    "texture": "贴图路径",
    "color": "颜色",
    "link": "wiki 链接",
    "glint": "附魔光效",
}

DEFAULT_PATH = Path(__file__).resolve().parent.parent / "src" / "data" / "items.ts"
STATIC_ROOT = Path(__file__).resolve().parent.parent / "static"
MC_TEXTURE_ROOT = STATIC_ROOT / "img" / "Minecraft"
TEXTURE_URL_PREFIX = "/img/Minecraft"


# ============ TypeScript 对象字面量的极简解析/回写 ============

class _Parser:
    """解析 TS 对象字面量的子集：对象、数组、字符串、数字、布尔。"""

    def __init__(self, text: str, pos: int = 0):
        self.text = text
        self.pos = pos

    def skip(self):
        n = len(self.text)
        while self.pos < n:
            c = self.text[self.pos]
            if c in " \t\r\n,":
                self.pos += 1
            elif c == "/" and self.text.startswith("//", self.pos):
                nl = self.text.find("\n", self.pos)
                self.pos = n if nl == -1 else nl + 1
            elif c == "/" and self.text.startswith("/*", self.pos):
                end = self.text.find("*/", self.pos + 2)
                self.pos = n if end == -1 else end + 2
            else:
                break

    def parse_value(self):
        self.skip()
        c = self.text[self.pos]
        if c == "{":
            return self.parse_object()
        if c == "[":
            return self.parse_array()
        if c in "'\"":
            return self.parse_string()
        return self.parse_bare()

    def parse_object(self):
        assert self.text[self.pos] == "{"
        self.pos += 1
        obj = {}
        while True:
            self.skip()
            if self.text[self.pos] == "}":
                self.pos += 1
                return obj
            if self.text[self.pos] in "'\"":
                key = self.parse_string()
            else:
                key = self.parse_bare()
                key = str(key)
            self.skip()
            if self.text[self.pos] != ":":
                raise ValueError(f"位置 {self.pos} 期望 ':'，实际 {self.text[self.pos]!r}")
            self.pos += 1
            obj[key] = self.parse_value()

    def parse_array(self):
        assert self.text[self.pos] == "["
        self.pos += 1
        arr = []
        while True:
            self.skip()
            if self.text[self.pos] == "]":
                self.pos += 1
                return arr
            arr.append(self.parse_value())

    def parse_string(self):
        quote = self.text[self.pos]
        self.pos += 1
        buf = []
        while True:
            c = self.text[self.pos]
            if c == "\\":
                nxt = self.text[self.pos + 1]
                buf.append({"n": "\n", "t": "\t"}.get(nxt, nxt))
                self.pos += 2
                continue
            if c == quote:
                self.pos += 1
                return "".join(buf)
            buf.append(c)
            self.pos += 1

    def parse_bare(self):
        start = self.pos
        while self.pos < len(self.text) and self.text[self.pos] not in " \t\r\n,:{}[]":
            self.pos += 1
        token = self.text[start:self.pos]
        if token == "true":
            return True
        if token == "false":
            return False
        try:
            return float(token) if "." in token else int(token)
        except ValueError:
            return token


def _find_block_end(text: str, start: int) -> int:
    """从对象起始 '{' 找到与之匹配的 '}'（跳过字符串与注释）。"""
    depth = 0
    i = start
    n = len(text)
    while i < n:
        c = text[i]
        if c in "'\"":
            quote = c
            i += 1
            while i < n:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == quote:
                    i += 1
                    break
                i += 1
            continue
        if c == "/" and text.startswith("//", i):
            nl = text.find("\n", i)
            i = n if nl == -1 else nl + 1
            continue
        if c == "/" and text.startswith("/*", i):
            end = text.find("*/", i + 2)
            i = n if end == -1 else end + 2
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError("没有找到 items 对象的结束位置")


ITEMS_RE = re.compile(r"export\s+const\s+items\s*:\s*Record<[^>]*>\s*=\s*\{")


def load_items(path: Path):
    """返回 (items 字典, 原文, 对象起始下标, 对象结束下标)。"""
    text = path.read_text(encoding="utf-8")
    m = ITEMS_RE.search(text)
    if not m:
        raise ValueError("文件里找不到 `export const items: Record<string, ItemDef> = {`")
    start = m.end() - 1
    end = _find_block_end(text, start)
    items = _Parser(text, start).parse_object()
    return items, text, start, end


def _fmt_value(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        return "[" + ", ".join(_fmt_value(x) for x in v) + "]"
    s = str(v).replace("\\", "\\\\").replace("'", "\\'")
    return f"'{s}'"


def _ordered_fields(data: dict):
    fields = [(k, data[k]) for k in FIELD_ORDER if data.get(k) not in (None, "", [])]
    for k, v in data.items():
        if k not in FIELD_ORDER and v not in (None, "", []):
            fields.append((k, v))
    return fields


def render_items(items: dict) -> str:
    """只渲染对象字面量本身（从 { 到 }），声明部分由原文件保留。"""
    lines = ["{"]
    for item_id, data in items.items():
        key = _fmt_value(item_id)
        fields = _ordered_fields(data)
        body = ", ".join(f"{k}: {_fmt_value(v)}" for k, v in fields)
        has_long_array = any(isinstance(v, list) and len(v) > 2 for _, v in fields)
        if not has_long_array and len(body) + len(key) + 6 <= 100:
            lines.append(f"  {key}: {{{body}}}," if body else f"  {key}: {{}},")
        else:
            lines.append(f"  {key}: {{")
            for k, v in fields:
                if isinstance(v, list) and len(v) > 2:
                    lines.append(f"    {k}: [")
                    for x in v:
                        lines.append(f"      {_fmt_value(x)},")
                    lines.append("    ],")
                else:
                    lines.append(f"    {k}: {_fmt_value(v)},")
            lines.append("  },")
    lines.append("}")
    return "\n".join(lines)


def save_items(path: Path, items: dict):
    _, text, start, end = load_items(path)
    new_block = render_items(items)
    new_text = text[:start] + new_block + text[end + 1:]
    if path.exists():
        shutil.copyfile(path, path.with_suffix(path.suffix + ".bak"))
    path.write_text(new_text, encoding="utf-8")


# ============ 资源索引（启动时扫描一次，之后复用） ============

# 相对目录 -> 该目录下的文件列表
_ASSET_INDEX: dict[str, list[Path]] = {}
# 贴图路径 -> 按像素放大的 PhotoImage（避免每次选中都重新解码）
_PREVIEW_CACHE: dict[tuple[str, int], object] = {}


def build_asset_index(force: bool = False) -> dict[str, list[Path]]:
    """扫描 static/img/Minecraft 一次，缓存目录 -> 文件列表。"""
    global _ASSET_INDEX
    if _ASSET_INDEX and not force:
        return _ASSET_INDEX
    index: dict[str, list[Path]] = {}
    if MC_TEXTURE_ROOT.exists():
        for path in sorted(MC_TEXTURE_ROOT.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(MC_TEXTURE_ROOT).parent.as_posix()
            index.setdefault(rel, []).append(path)
    _ASSET_INDEX = index
    return index


def asset_dirs() -> list[str]:
    """所有相对目录（含只有子目录、没有文件的中间层），按层级顺序返回。

    顶层目录（block / item / items / SlimeFun / model …）必须始终保留，
    否则 _fill_tree 找不到父节点，会把子目录全部挂到根上。
    """
    dirs: set[str] = set()
    for rel in build_asset_index():
        if rel == ".":      # 直接放在 Minecraft 根目录下的文件，不建节点
            continue
        current = Path(rel)
        while current.as_posix() != ".":
            dirs.add(current.as_posix())
            current = current.parent
    # 父目录永远排在子目录前面，保证建树时父节点已存在
    return sorted(dirs, key=lambda r: (r.count("/"), r))


def asset_files(rel_dir: str, extensions) -> list[Path]:
    """取某个目录下指定后缀的文件（已缓存，不重复扫描磁盘）。"""
    exts = tuple(extensions)
    return [p for p in build_asset_index().get(rel_dir, []) if p.suffix in exts]


def preview_photo(path: Path, target: int = 32):
    """加载贴图并按像素风放大到约 target 像素；结果按路径缓存。"""
    key = (str(path), target)
    cached = _PREVIEW_CACHE.get(key)
    if cached is not None:
        return cached
    try:
        img = tk.PhotoImage(file=str(path))
    except (tk.TclError, OSError):
        return None
    width = max(img.width(), 1)
    if width < target:
        img = img.zoom(max(1, target // width))
    elif width > target * 3:
        img = img.subsample(width // (target * 3))
    _PREVIEW_CACHE[key] = img
    return img


def model_texture_preview(json_path: Path):
    """沿 parent 链找方块模型引用的第一张贴图，用于预览。"""
    seen = set()
    current = json_path
    for _ in range(8):
        try:
            data = json.loads(current.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        for ref in (data.get("textures") or {}).values():
            if isinstance(ref, str) and not ref.startswith("#"):
                candidate = MC_TEXTURE_ROOT / "block" / f"{ref.split('/')[-1]}.png"
                if candidate.exists():
                    return candidate
        for element in data.get("elements") or []:
            for face in (element.get("faces") or {}).values():
                ref = (face or {}).get("texture")
                if isinstance(ref, str) and not ref.startswith("#"):
                    candidate = MC_TEXTURE_ROOT / "block" / f"{ref.split('/')[-1]}.png"
                    if candidate.exists():
                        return candidate
        parent = data.get("parent")
        if not parent:
            break
        parent_id = parent.split("/")[-1]
        if parent_id in seen:
            break
        seen.add(parent_id)
        current = MC_TEXTURE_ROOT / "block" / f"{parent_id}.json"
        if not current.exists():
            break
    return None


class AssetPicker(tk.Toplevel):
    """浏览 static/img/Minecraft 下的资源文件，返回 URL 路径。

    extensions 指定文件后缀；multi=True 时可多选（结果按行拼接）。
    """

    def __init__(
        self,
        master,
        current: str,
        on_pick,
        extensions=(".png",),
        multi: bool = False,
        only_dir: str = None,
        title: str = "选择资源",
    ):
        super().__init__(master)
        self.title(f"{title} - static/img/Minecraft")
        self.geometry("820x560")
        self.transient(master)
        self.grab_set()

        self.on_pick = on_pick
        self.current = current
        self.extensions = tuple(extensions)
        self.multi = multi
        self.only_dir = only_dir
        self.dir_nodes = {}   # 相对目录 -> treeview iid
        self.iid_dirs = {}    # treeview iid -> 相对目录
        self.files = []       # 当前目录下的文件
        self.current_dir = None
        self._preview_img = None

        self._build()
        self._fill_tree()
        self._locate_current()

    # ---------- 界面 ----------
    def _build(self):
        outer = ttk.Frame(self, padding=8)
        outer.pack(fill="both", expand=True)
        paned = ttk.PanedWindow(outer, orient="horizontal")
        paned.pack(fill="both", expand=True)

        left = ttk.Frame(paned)
        paned.add(left, weight=1)
        ttk.Label(left, text="目录").pack(anchor="w")
        tree_wrap = ttk.Frame(left)
        tree_wrap.pack(fill="both", expand=True)
        self.tree = ttk.Treeview(tree_wrap, show="tree")
        tree_scroll = ttk.Scrollbar(tree_wrap, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=tree_scroll.set)
        self.tree.pack(side="left", fill="both", expand=True)
        tree_scroll.pack(side="right", fill="y")
        self.tree.bind("<<TreeviewSelect>>", self._on_dir_select)

        right = ttk.Frame(paned, padding=(10, 0, 0, 0))
        paned.add(right, weight=2)

        search_row = ttk.Frame(right)
        search_row.pack(fill="x", pady=(0, 6))
        ttk.Label(search_row, text="筛选").pack(side="left")
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", lambda *_: self._refresh_files())
        ttk.Entry(search_row, textvariable=self.search_var).pack(
            side="left", fill="x", expand=True, padx=6
        )

        list_wrap = ttk.Frame(right)
        list_wrap.pack(fill="both", expand=True)
        self.file_list = tk.Listbox(
            list_wrap,
            exportselection=False,
            selectmode="extended" if self.multi else "browse",
        )
        file_scroll = ttk.Scrollbar(list_wrap, orient="vertical", command=self.file_list.yview)
        self.file_list.configure(yscrollcommand=file_scroll.set)
        self.file_list.pack(side="left", fill="both", expand=True)
        file_scroll.pack(side="right", fill="y")
        self.file_list.bind("<<ListboxSelect>>", self._on_file_select)
        self.file_list.bind("<Double-Button-1>", lambda e: self._confirm())

        preview_row = ttk.Frame(right)
        preview_row.pack(fill="x", pady=(8, 0))
        self.preview_label = ttk.Label(preview_row, text="（未选择）", width=20)
        self.preview_label.pack(side="left")
        self.path_var = tk.StringVar(value="")
        ttk.Label(preview_row, textvariable=self.path_var, foreground="#4a5568").pack(
            side="left", padx=8
        )

        btn_row = ttk.Frame(right)
        btn_row.pack(fill="x", pady=(10, 0))
        ttk.Button(btn_row, text="确定", command=self._confirm).pack(side="right")
        ttk.Button(btn_row, text="取消", command=self.destroy).pack(side="right", padx=6)
        ttk.Button(btn_row, text="清空", command=self._clear).pack(side="left")

    # ---------- 数据 ----------
    def _fill_tree(self):
        # 目录列表来自启动时建立的一次性索引，不再重复扫描磁盘
        rels = asset_dirs()
        if self.only_dir:
            prefix = f"{self.only_dir}/"
            rels = [r for r in rels if r == self.only_dir or r.startswith(prefix)]
        for rel in rels:
            parent_rel = Path(rel).parent.as_posix()
            parent_iid = "" if parent_rel == "." else self.dir_nodes.get(parent_rel, "")
            iid = self.tree.insert(
                parent_iid, "end", text=Path(rel).name, open=len(rel.split("/")) <= 1
            )
            self.dir_nodes[rel] = iid
            self.iid_dirs[iid] = rel

    def _locate_current(self):
        rel_dir = None
        filename = None
        first_line = ""
        for line in (self.current or "").replace(",", "\n").splitlines():
            if line.strip():
                first_line = line.strip().replace("\\", "/")
                break
        value = first_line
        for prefix in (TEXTURE_URL_PREFIX + "/", "img/Minecraft/", "Minecraft/", "img/"):
            if value.startswith(prefix):
                candidate = Path(value[len(prefix):])
                rel_dir = candidate.parent.as_posix()
                filename = candidate.name
                break
        if not filename and value and "/" not in value:
            # 纯模型 id（如 furnace）→ 默认目录下的同名 json
            filename = f"{value}{self.extensions[0]}" if "." not in value else value
            if self.only_dir:
                rel_dir = self.only_dir
        if rel_dir not in self.dir_nodes:
            rel_dir = self.only_dir or ("block" if "block" in self.dir_nodes else None)
            filename = None
        if rel_dir:
            iid = self.dir_nodes[rel_dir]
            self.tree.selection_set(iid)
            self.tree.focus(iid)
            self.tree.see(iid)
            self._load_dir(rel_dir, filename)

    def _on_dir_select(self, _event=None):
        sel = self.tree.selection()
        if not sel:
            return
        rel = self.iid_dirs.get(sel[0])
        if rel:
            self._load_dir(rel)

    def _load_dir(self, rel: str, select_file: str = None):
        self.current_dir = rel
        self._refresh_files(select_file)

    def _refresh_files(self, select_file: str = None):
        self.file_list.delete(0, "end")
        self.files = []
        if not self.current_dir:
            return
        keyword = self.search_var.get().strip().lower()
        # 文件列表取自启动时建立的一次性索引
        for path in asset_files(self.current_dir, self.extensions):
            if keyword and keyword not in path.name.lower():
                continue
            self.files.append(path)
            self.file_list.insert("end", path.name)
        if not self.files:
            return

        wanted = {select_file} if select_file else set()
        if self.multi and self.current:
            # 多选模式：把已有内容对应的文件名都选中
            for line in self.current.replace(",", "\n").splitlines():
                token = line.strip().replace("\\", "/").split("/")[-1]
                if not token:
                    continue
                if "." not in token:
                    token = f"{token}{self.extensions[0]}"
                wanted.add(token)
        names = [p.name for p in self.files]
        indices = [i for i, n in enumerate(names) if n in wanted]
        if not indices:
            indices = [0]
        for i in indices:
            self.file_list.selection_set(i)
        self.file_list.see(indices[0])
        self._on_file_select()

    def _selected_paths(self):
        return [
            self.files[i]
            for i in self.file_list.curselection()
            if i < len(self.files)
        ]

    def _url_for(self, path: Path) -> str:
        return f"{TEXTURE_URL_PREFIX}/{self.current_dir}/{path.name}"

    def _on_file_select(self, _event=None):
        paths = self._selected_paths()
        if not paths:
            return
        if self.multi and len(paths) > 1:
            self.path_var.set(f"已选 {len(paths)} 个模型")
        else:
            self.path_var.set(self._url_for(paths[0]))
        target = paths[-1]
        image_path = target
        if target.suffix.lower() == ".json":
            image_path = model_texture_preview(target)
        img = preview_photo(image_path, 64) if image_path else None
        if img:
            self._preview_img = img
            self.preview_label.configure(image=img, text="")
        else:
            self._preview_img = None
            self.preview_label.configure(image="", text="（无法预览）")

    def _confirm(self):
        paths = self._selected_paths()
        if not paths:
            return
        if self.multi:
            self.on_pick("\n".join(self._url_for(p) for p in paths))
        else:
            self.on_pick(self._url_for(paths[0]))
        self.destroy()

    def _clear(self):
        self.on_pick("")
        self.destroy()


class ItemsEditor:
    def __init__(self, root: tk.Tk, path: Path):
        self.root = root
        self.path = path
        self.items = {}
        self.current_id = None
        self.suppress_select = False

        root.title(f"items.ts 编辑器 - {path}")
        root.geometry("980x620")
        root.minsize(760, 480)
        self._build_ui()
        self.reload()

    # ---------- 界面 ----------
    def _build_ui(self):
        outer = ttk.Frame(self.root, padding=8)
        outer.pack(fill="both", expand=True)

        paned = ttk.PanedWindow(outer, orient="horizontal")
        paned.pack(fill="both", expand=True)

        # 左侧：搜索 + 列表
        left = ttk.Frame(paned)
        paned.add(left, weight=1)

        search_row = ttk.Frame(left)
        search_row.pack(fill="x", pady=(0, 6))
        ttk.Label(search_row, text="搜索").pack(side="left")
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", lambda *_: self.refresh_list())
        ttk.Entry(search_row, textvariable=self.search_var).pack(
            side="left", fill="x", expand=True, padx=6
        )

        list_frame = ttk.Frame(left)
        list_frame.pack(fill="both", expand=True)
        self.listbox = tk.Listbox(list_frame, exportselection=False)
        scroll = ttk.Scrollbar(list_frame, orient="vertical", command=self.listbox.yview)
        self.listbox.configure(yscrollcommand=scroll.set)
        self.listbox.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        self.listbox.bind("<<ListboxSelect>>", self.on_select)

        btn_row = ttk.Frame(left)
        btn_row.pack(fill="x", pady=(6, 0))
        ttk.Button(btn_row, text="新建", command=self.new_item).pack(side="left")
        ttk.Button(btn_row, text="重命名", command=self.rename_item).pack(side="left", padx=6)
        ttk.Button(btn_row, text="删除", command=self.delete_item).pack(side="left")

        # 右侧：表单
        right = ttk.Frame(paned, padding=(12, 0, 0, 0))
        paned.add(right, weight=2)

        self.id_var = tk.StringVar(value="（未选择）")
        id_row = ttk.Frame(right)
        id_row.pack(fill="x", pady=(0, 8))
        ttk.Label(id_row, text="物品 id:", font=("", 10, "bold")).pack(side="left")
        ttk.Label(id_row, textvariable=self.id_var, foreground="#2b6cb0").pack(
            side="left", padx=6
        )

        self.vars = {}
        for field in ("name", "texture", "color", "link"):
            row = ttk.Frame(right)
            row.pack(fill="x", pady=4)
            ttk.Label(row, text=f"{FIELD_LABELS[field]}:", width=10).pack(side="left")
            var = tk.StringVar()
            ttk.Entry(row, textvariable=var).pack(side="left", fill="x", expand=True)
            if field == "texture":
                ttk.Button(row, text="浏览…", command=self.pick_texture).pack(
                    side="left", padx=(6, 0)
                )
            self.vars[field] = var

        glint_row = ttk.Frame(right)
        glint_row.pack(fill="x", pady=4)
        ttk.Label(glint_row, text=f"{FIELD_LABELS['glint']}:", width=10).pack(side="left")
        self.glint_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            glint_row,
            text="显示附魔光效（仅 ItemIcon / 配方槽位）",
            variable=self.glint_var,
        ).pack(side="left")

        preview_row = ttk.Frame(right)
        preview_row.pack(fill="x", pady=(0, 4))
        ttk.Label(preview_row, text="预览:", width=10).pack(side="left")
        self.preview_label = ttk.Label(preview_row, text="（无贴图）")
        self.preview_label.pack(side="left")
        self.vars["texture"].trace_add("write", lambda *_: self.update_preview())

        block_row = ttk.Frame(right)
        block_row.pack(fill="both", expand=True, pady=4)
        ttk.Label(block_row, text=f"{FIELD_LABELS['block']}:", width=10).pack(
            side="left", anchor="n"
        )
        ttk.Button(block_row, text="浏览…", command=self.pick_block_models).pack(
            side="right", anchor="n", padx=(6, 0)
        )
        block_wrap = ttk.Frame(block_row)
        block_wrap.pack(side="left", fill="both", expand=True)
        self.block_text = tk.Text(block_wrap, height=7, wrap="none", undo=True)
        block_scroll = ttk.Scrollbar(
            block_wrap, orient="vertical", command=self.block_text.yview
        )
        self.block_text.configure(yscrollcommand=block_scroll.set)
        self.block_text.pack(side="left", fill="both", expand=True)
        block_scroll.pack(side="right", fill="y")
        ttk.Label(
            block_wrap,
            text="每行一个模型 id，多行表示叠加渲染（如雕纹书架 + 槽位）",
            foreground="#718096",
        ).pack(anchor="w", pady=(4, 0))

        action_row = ttk.Frame(right)
        action_row.pack(fill="x", pady=(12, 0))
        ttk.Button(action_row, text="保存 (Ctrl+S)", command=self.save).pack(side="left")
        ttk.Button(action_row, text="重新加载", command=self.reload).pack(side="left", padx=6)
        ttk.Button(action_row, text="选择文件…", command=self.choose_file).pack(side="left")

        self.status_var = tk.StringVar(value="")
        ttk.Label(outer, textvariable=self.status_var, foreground="#4a5568").pack(
            anchor="w", pady=(6, 0)
        )

        self.root.bind("<Control-s>", lambda e: self.save())

    # ---------- 数据 ----------
    def reload(self):
        try:
            self.items, _, _, _ = load_items(self.path)
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror("读取失败", str(exc))
            return
        # 重新扫描资源目录（新增贴图后点「重新加载」即可生效）
        build_asset_index(force=True)
        self.current_id = None
        self.clear_form()
        self.refresh_list()
        asset_count = sum(len(v) for v in _ASSET_INDEX.values())
        self.set_status(
            f"已加载 {len(self.items)} 个物品、{asset_count} 个资源：{self.path}"
        )

    def refresh_list(self):
        keyword = self.search_var.get().strip().lower()
        self.listbox.delete(0, "end")
        self.visible_ids = []
        for item_id, data in self.items.items():
            haystack = f"{item_id} {data.get('name', '')}".lower()
            if keyword and keyword not in haystack:
                continue
            self.visible_ids.append(item_id)
            label = item_id
            if data.get("name"):
                label = f"{item_id}  ·  {data['name']}"
            self.listbox.insert("end", label)
        # 恢复选中
        if self.current_id in self.visible_ids:
            idx = self.visible_ids.index(self.current_id)
            self.suppress_select = True
            self.listbox.selection_set(idx)
            self.listbox.see(idx)
            self.suppress_select = False

    def clear_form(self):
        self.id_var.set("（未选择）")
        for var in self.vars.values():
            var.set("")
        self.glint_var.set(False)
        self.block_text.delete("1.0", "end")

    def load_into_form(self, item_id):
        data = self.items.get(item_id, {})
        self.id_var.set(item_id)
        for field, var in self.vars.items():
            var.set(str(data.get(field, "")))
        self.glint_var.set(bool(data.get("glint")))
        block = data.get("block", "")
        if isinstance(block, list):
            block = "\n".join(block)
        self.block_text.delete("1.0", "end")
        self.block_text.insert("1.0", block)

    # ---------- 贴图 / 模型 ----------
    def pick_texture(self):
        if not MC_TEXTURE_ROOT.exists():
            messagebox.showwarning(
                "找不到贴图目录",
                f"未找到 {MC_TEXTURE_ROOT}\n请确认 static/img/Minecraft 存在。",
            )
            return
        AssetPicker(
            self.root,
            self.vars["texture"].get(),
            self._set_texture,
            extensions=(".png",),
            title="选择贴图",
        )

    def pick_block_models(self):
        if not (MC_TEXTURE_ROOT / "block").exists():
            messagebox.showwarning(
                "找不到模型目录",
                f"未找到 {MC_TEXTURE_ROOT / 'block'}",
            )
            return
        AssetPicker(
            self.root,
            self.block_text.get("1.0", "end"),
            self._set_blocks,
            extensions=(".json",),
            multi=True,
            only_dir="block",
            title="选择方块模型（可多选叠加）",
        )

    def _set_texture(self, value: str):
        self.vars["texture"].set(value)
        self.update_preview()

    def _set_blocks(self, value: str):
        """把选择器返回的 URL 转成模型 id（每行一个）。"""
        ids = []
        for line in value.replace(",", "\n").splitlines():
            token = line.strip().replace("\\", "/")
            if not token:
                continue
            if token.startswith(TEXTURE_URL_PREFIX + "/"):
                token = token[len(TEXTURE_URL_PREFIX) + 1:]
            if token.startswith("block/"):
                token = token[len("block/"):]
            if token.endswith(".json"):
                token = token[:-5]
            ids.append(token)
        self.block_text.delete("1.0", "end")
        self.block_text.insert("1.0", "\n".join(ids))

    def _resolve_texture_file(self, value: str):
        """把 /img/... 或 img/... 转成 static 下的实际文件路径。"""
        value = (value or "").strip()
        if not value:
            # 回退到默认的 /img/Minecraft/item/<id>.png
            if self.current_id:
                candidate = MC_TEXTURE_ROOT / "item" / f"{self.current_id}.png"
                if candidate.exists():
                    return candidate
            return None
        if value.startswith("/img/"):
            return STATIC_ROOT / value.lstrip("/")
        if value.startswith("img/"):
            return STATIC_ROOT / value
        return Path(value)

    def update_preview(self):
        if not hasattr(self, "preview_label"):
            return
        path = self._resolve_texture_file(self.vars["texture"].get())
        img = preview_photo(path, 32) if path and path.exists() else None
        if img:
            self._preview_img = img
            self.preview_label.configure(image=img, text="")
        else:
            self._preview_img = None
            self.preview_label.configure(image="", text="（无贴图）")

    def commit_form(self):
        """把表单内容写回 self.items（未选择时忽略）。"""
        if not self.current_id or self.current_id not in self.items:
            return
        data = {}
        for field, var in self.vars.items():
            value = var.get().strip()
            if value:
                data[field] = value
        lines = [ln.strip() for ln in self.block_text.get("1.0", "end").splitlines()]
        lines = [ln for ln in lines if ln]
        if lines:
            data["block"] = lines[0] if len(lines) == 1 else lines
        if self.glint_var.get():
            data["glint"] = True
        self.items[self.current_id] = data

    # ---------- 事件 ----------
    def on_select(self, _event=None):
        if self.suppress_select:
            return
        sel = self.listbox.curselection()
        if not sel:
            return
        new_id = self.visible_ids[sel[0]]
        if new_id == self.current_id:
            return
        self.commit_form()
        self.current_id = new_id
        self.load_into_form(new_id)
        self.set_status(f"正在编辑：{new_id}")

    def new_item(self):
        item_id = simpledialog.askstring("新建物品", "输入物品 id（如 me_interface）：", parent=self.root)
        if not item_id:
            return
        item_id = item_id.strip()
        if not item_id:
            return
        if item_id in self.items:
            messagebox.showwarning("已存在", f"物品 id「{item_id}」已存在")
            return
        self.commit_form()
        self.items[item_id] = {}
        self.current_id = item_id
        self.refresh_list()
        self.load_into_form(item_id)
        self.set_status(f"已新建：{item_id}（填写内容后记得保存）")

    def rename_item(self):
        if not self.current_id:
            messagebox.showinfo("提示", "请先选择一个物品")
            return
        new_id = simpledialog.askstring(
            "重命名", "新的物品 id：", initialvalue=self.current_id, parent=self.root
        )
        if not new_id or new_id.strip() == self.current_id:
            return
        new_id = new_id.strip()
        if new_id in self.items:
            messagebox.showwarning("已存在", f"物品 id「{new_id}」已存在")
            return
        self.commit_form()
        # 保持原有顺序重建字典
        rebuilt = {}
        for key, value in self.items.items():
            rebuilt[new_id if key == self.current_id else key] = value
        self.items = rebuilt
        self.current_id = new_id
        self.refresh_list()
        self.load_into_form(new_id)
        self.set_status(f"已重命名为：{new_id}")

    def delete_item(self):
        if not self.current_id:
            messagebox.showinfo("提示", "请先选择一个物品")
            return
        if not messagebox.askyesno("确认删除", f"确定删除「{self.current_id}」？"):
            return
        target = self.current_id
        del self.items[target]
        self.current_id = None
        self.clear_form()
        self.refresh_list()
        self.set_status(f"已删除：{target}（记得保存）")

    def save(self):
        if self.current_id:
            self.commit_form()
        try:
            save_items(self.path, self.items)
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror("保存失败", str(exc))
            return
        self.set_status(f"已保存 {len(self.items)} 个物品（备份：{self.path.name}.bak）")

    def choose_file(self):
        chosen = filedialog.askopenfilename(
            title="选择 items.ts",
            initialdir=str(self.path.parent),
            filetypes=[("TypeScript", "*.ts"), ("所有文件", "*.*")],
        )
        if chosen:
            self.path = Path(chosen)
            self.root.title(f"items.ts 编辑器 - {self.path}")
            self.reload()

    def set_status(self, text):
        self.status_var.set(text)


def main():
    args = [a for a in sys.argv[1:]]
    if "--check" in args:
        target = DEFAULT_PATH if len(args) < 2 else Path(args[0])
        items, _, _, _ = load_items(target)
        rendered = render_items(items)
        reparsed = _Parser(rendered, rendered.index("{")).parse_object()

        def normalize(data):
            # 空字符串/空数组视为未填写，回写时会省略
            return {k: v for k, v in data.items() if v not in (None, "", [])}

        normalized = {k: normalize(v) for k, v in items.items()}
        ok = {k: normalize(v) for k, v in reparsed.items()} == normalized
        print(f"解析 {len(items)} 个物品，往返校验：{'PASS' if ok else 'FAIL'}")
        if not ok:
            for key in items:
                if normalized[key] != normalize(reparsed.get(key, {})):
                    print(f"  不一致: {key}\n    原始: {normalized[key]}\n    回写: {reparsed.get(key)}")
        return 0 if ok else 1

    target = Path(args[0]) if args else DEFAULT_PATH
    if not target.exists():
        print(f"文件不存在: {target}")
        return 1
    root = tk.Tk()
    try:
        ttk.Style().theme_use("vista")
    except tk.TclError:
        pass
    ItemsEditor(root, target)
    root.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
