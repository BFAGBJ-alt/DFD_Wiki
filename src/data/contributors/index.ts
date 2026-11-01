import type {ContributorProfile} from './types';
import {contributors as bfagbj} from './bfagbj';
import {contributors as deepseek} from './deepseek';
import {contributors as msaw4} from './msaw4';
import {contributors as gzs1596eg} from './gzs1596eg';
import {contributors as ylzm} from './ylzm';
import {contributors as claude} from './claude';

export type {ContributorProfile};

export const contributors: Record<string, ContributorProfile> = {
  ...bfagbj,
  ...deepseek,
  ...msaw4,
  ...gzs1596eg,
  ...ylzm,
  ...claude,
};
