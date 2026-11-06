import type {ComponentType} from 'react';
import ComponentTypes from '@theme-original/NavbarItem/ComponentTypes';
import NavbarDrawerToggle from '@site/src/components/NavbarDrawerToggle';

const types: Record<string, ComponentType<never>> = {
  ...ComponentTypes,
  'custom-drawer-toggle': NavbarDrawerToggle as unknown as ComponentType<never>,
};

export default types;
