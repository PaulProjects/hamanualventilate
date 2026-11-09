import { css } from 'lit';

export const cardStyles = css`
  :host {
    --vc-go: var(--success-color, #43a047);
    --vc-stop: var(--error-color, #db4437);
    --vc-wait: var(--warning-color, #ffa600);
    --vc-warm: var(--deep-orange-color, #ff5722);
    --vc-cold: var(--blue-color, #2196f3);
    --vc-humid: var(--cyan-color, #00acc1);
    --vc-muted: var(--secondary-text-color, #727272);
    /* Graph line colours, one per metric */
    --vc-t: var(--orange-color, #ff9800);
    --vc-rh: var(--cyan-color, #00acc1);
    --vc-ah: var(--purple-color, #ab47bc);
    --vc-stat-width: 4.6em;
  }
  ha-card {
    padding: 12px 12px 8px;
  }
  .header {
    margin-bottom: 8px;
  }
  .title {
    font-size: 1.15em;
    font-weight: 500;
  }

  /* The left edge colour is the advice at a glance */
  .room {
    --c: transparent;
    border-left: 4px solid var(--c);
    border-top: 1px solid var(--divider-color, #e0e0e0);
    padding-left: 8px;
  }
  .room.outdoor {
    border-top: none;
  }
  .room.air,
  .room.open {
    --c: var(--vc-go);
  }
  .room.close {
    --c: var(--vc-stop);
  }
  .room.wait {
    --c: var(--vc-wait);
  }
  .room.heat {
    --c: var(--vc-warm);
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(3, var(--vc-stat-width));
    align-items: center;
    gap: 2px 4px;
    padding: 8px 0;
  }
  .row[role='button'] {
    cursor: pointer;
  }
  .row:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: 2px;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-weight: 500;
  }
  .name span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name ha-icon {
    --mdc-icon-size: 20px;
    flex: none;
    color: var(--vc-muted);
  }
  button.stat {
    font: inherit;
    font-weight: 500;
    background: none;
    border: none;
    padding: 4px 0;
    cursor: pointer;
    border-radius: 4px;
  }
  button.stat:hover {
    background: var(--secondary-background-color, rgba(127, 127, 127, 0.15));
  }
  button.stat:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
  }
  .stat {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    color: var(--primary-text-color, #212121);
  }
  small {
    font-size: 0.7em;
    font-weight: 400;
    color: var(--vc-muted);
    margin-left: 1px;
  }
  .stat.warm {
    color: var(--vc-warm);
  }
  .stat.cold {
    color: var(--vc-cold);
  }
  .stat.humid {
    color: var(--vc-humid);
  }
  .hint {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85em;
    color: var(--vc-muted);
  }
  .hint .text {
    flex: 1;
  }
  .age {
    font-size: 0.85em;
    color: var(--vc-muted);
    white-space: nowrap;
  }
  .age.late {
    color: var(--vc-wait);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
    background: var(--c);
    border: 1px solid var(--divider-color, #ccc);
  }
  .room:not(.ok):not(.unknown) .hint .text {
    color: var(--primary-text-color, #212121);
  }
  .room:not(.ok):not(.unknown) .dot {
    border-color: var(--c);
  }

  .chart {
    padding: 2px 0 8px;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
    font-size: 0.75em;
    color: var(--vc-muted);
    margin-bottom: 4px;
  }
  .legend i {
    display: inline-block;
    width: 12px;
    margin-right: 4px;
    vertical-align: middle;
    border-top: 2px solid currentColor;
  }
  .legend i.thin {
    border-top-width: 1px;
    opacity: 0.6;
  }
  .t {
    color: var(--vc-t);
  }
  .rh {
    color: var(--vc-rh);
  }
  .ah {
    color: var(--vc-ah);
  }
  svg {
    width: 100%;
    height: 120px;
    display: block;
    overflow: visible;
  }
  svg * {
    vector-effect: non-scaling-stroke;
    fill: none;
  }
  polyline {
    stroke: currentColor;
    stroke-width: 2;
    stroke-linejoin: round;
  }
  polyline.thin {
    stroke-width: 1;
    opacity: 0.6;
  }
  polyline.dashed {
    stroke-dasharray: 5 3;
  }
  line.grid {
    stroke: var(--divider-color, #e0e0e0);
    stroke-width: 0.5;
  }
  line.now {
    stroke: var(--primary-text-color, #212121);
    stroke-width: 1;
    opacity: 0.5;
  }
  /* Target temperature / humidity ceiling, in the colour of its metric */
  line.ref {
    stroke: currentColor;
    stroke-width: 1;
    stroke-dasharray: 1 4;
  }
  .ticks {
    position: relative;
    height: 1.2em;
    font-size: 0.65em;
    color: var(--vc-muted);
  }
  .ticks span {
    position: absolute;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  .ticks .now-label {
    color: var(--primary-text-color, #212121);
    background: var(--ha-card-background, var(--card-background-color, #fff));
    padding: 0 2px;
  }
  .note {
    padding-bottom: 8px;
    font-size: 0.75em;
    color: var(--vc-muted);
  }
`;
