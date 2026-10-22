import type {Band} from './types';

export function bandDisabled(band:Band,now=Date.now()):boolean {
  // Local date/time drafts are resolved authoritatively in HA's timezone on Save.
  return band.enabled===false&&(!band.disabled_until||!/(Z|[+-]\d\d:\d\d)$/.test(band.disabled_until)||now<Date.parse(band.disabled_until));
}
