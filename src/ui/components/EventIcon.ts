import type { EventType } from '../../core/types.ts';

const ICONS: Record<EventType, string> = {
  RoadBlockage: '🚧',
  ShortcutToggle: '↔',
  OilSpill: '⚠',
  SpeedRestriction: '🐢',
  FuelStationAvailability: '⛽',
  NitroBooster: 'N',
};

const LABELS: Record<EventType, string> = {
  RoadBlockage: 'Closed',
  ShortcutToggle: 'Shortcut changed',
  OilSpill: 'Oil spill',
  SpeedRestriction: 'Speed cap',
  FuelStationAvailability: 'Fuel station',
  NitroBooster: 'Nitro spawned',
};

type Severity = 'danger' | 'warn' | 'ok';

function severity(type: EventType): Severity {
  if (type === 'RoadBlockage') return 'danger';
  if (type === 'OilSpill' || type === 'SpeedRestriction') return 'warn';
  return 'ok';
}

export class EventIcon {
  readonly el: HTMLElement;

  constructor(type: EventType, suffix?: string) {
    this.el = document.createElement('span');
    const sev = severity(type);
    this.el.className = `event-icon event-icon--${sev}`;
    this.el.setAttribute('aria-label', LABELS[type] + (suffix ? `: ${suffix}` : ''));
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = ICONS[type];
    const label = document.createElement('span');
    label.textContent = LABELS[type] + (suffix ? ` ${suffix}` : '');
    this.el.append(icon, label);
  }
}
