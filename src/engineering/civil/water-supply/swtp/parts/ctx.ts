import type { Mats } from '../../../../core/materials';
import type { ResolvedOptions } from '../../../../core/options';
import type { Site } from '../../../../core/Site';

export interface Ctx {
  mats: Mats;
  site: Site;
  opts: ResolvedOptions;
}
