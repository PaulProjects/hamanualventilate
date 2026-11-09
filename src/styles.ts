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
    --vc-stat-width: 4.6em;
  }
  ha-card {
    padding: 12px 12px 8px;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .title {
    font-size: 1.15em;
    font-weight: 500;
  }
  .metrics {
    display: flex;
    gap: 4px;
  }
  .chip {
    font: inherit;
    font-size: 0.75em;
    padding: 2px 8px;
    border-radius: 12px;
    border: 1px solid var(--divider-color, #ccc);
    background: none;
    color: var(--vc-muted);
    cursor: pointer;
  }
  .chip.on {
    background: var(--primary-color, #03a9f4);
    border-color: var(--primary-color, #03a9f4);
    color: var(--text-primary-color, #fff);
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
    color: var(--vc-muted);
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
    align-items: start;
    column-gap: 4px;
    padding: 6px 0;
  }
  .row[role='button'] {
    cursor: pointer;
  }
  .row:focus-visible,
  .chip:focus-visible {
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
  .stat {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1.2;
  }
  .value {
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }
  small {
    font-size: 0.7em;
    font-weight: 400;
    color: var(--vc-muted);
    margin-left: 1px;
  }
  .sub {
    font-size: 0.7em;
    color: var(--vc-muted);
    white-space: nowrap;
    min-height: 1.2em;
  }
  .outdoor .sub {
    display: none;
  }
  .stat.warm .value {
    color: var(--vc-warm);
  }
  .stat.cold .value {
    color: var(--vc-cold);
  }
  .stat.humid .value {
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
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
    background: var(--c);
    border: 1px solid var(--divider-color, #ccc);
  }
  .room:not(.ok):not(.unknown) .hint {
    color: var(--primary-text-color, #212121);
  }
  .room:not(.ok):not(.unknown) .dot {
    border-color: var(--c);
  }

  .graphs {
    padding: 2px 0 8px;
  }
  .chart {
    margin-top: 6px;
  }
  .chart-head {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 2px 8px;
    font-size: 0.75em;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    color: var(--vc-muted);
  }
  .legend i {
    display: inline-block;
    width: 12px;
    margin-right: 3px;
    vertical-align: middle;
    border-top: 2px solid currentColor;
  }
  .legend i.dashed {
    border-top-style: dashed;
  }
  .in {
    color: var(--primary-color, #03a9f4);
  }
  .out {
    color: var(--vc-muted);
  }
  .go {
    color: var(--vc-go);
  }
  .plot {
    position: relative;
    height: 72px;
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }
  svg * {
    vector-effect: non-scaling-stroke;
    fill: none;
  }
  polyline {
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linejoin: round;
  }
  polyline.out {
    stroke-width: 1.25;
  }
  .dashed {
    stroke-dasharray: 4 3;
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
  line.ref {
    stroke: var(--vc-go);
    stroke-width: 1;
    stroke-dasharray: 1 3;
  }
  .ymax,
  .ymin,
  .yref {
    position: absolute;
    left: 0;
    font-size: 0.65em;
    color: var(--vc-muted);
    pointer-events: none;
  }
  .ymax {
    top: 0;
  }
  .ymin {
    bottom: 0;
  }
  .yref {
    left: auto;
    right: 0;
    transform: translateY(-100%);
    color: var(--vc-go);
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
    margin-top: 6px;
    font-size: 0.7em;
    color: var(--vc-muted);
  }
`;
