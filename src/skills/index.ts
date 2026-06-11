export interface BundledSkill {
  name: string;
  description: string;
  filename: string;
  content: string;
}

export { modelBenchmark } from './bundled/model-benchmark';

import { modelBenchmark } from './bundled/model-benchmark';

export const BUNDLED_SKILLS: BundledSkill[] = [modelBenchmark];
