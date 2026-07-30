import { css } from 'lit';

export const cardStyles = css`
  /* ── Card container ───────────────────────────────────────── */
  :host {
    --vc-green: var(--success-color, var(--label-badge-green, #4caf50));
    --vc-red: var(--error-color, var(--label-badge-red, #f44336));
    --vc-yellow: var(--warning-color, var(--label-badge-yellow, #ff9800));
    --vc-blue: var(--info-color, var(--label-badge-blue, #2196f3));
    --vc-spacing: 16px;
  }

  ha-card {
    background: transparent;
    border: none;
    box-shadow: none;
    overflow: hidden;
  }

  .card-header,
  .card-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--vc-spacing) var(--vc-spacing) 0 var(--vc-spacing);
  }

  .card-header .title,
  .card-header-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--primary-text-color);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-header .title ha-icon,
  .card-header-title ha-icon,
  .card-header-title .header-icon {
    color: var(--primary-color);
    --mdc-icon-size: 20px;
  }

  .header-badges {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .goal-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 10px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-color) 16%, transparent);
    color: var(--primary-color);
    border: 1px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
  }

  /* Top Right Warning / Health Badge with Hover Tooltip */
  .warning-badge-wrapper {
    position: relative;
    display: inline-flex;
  }

  .warning-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--vc-yellow) 20%, transparent);
    color: var(--vc-yellow);
    cursor: help;
    border: 1px solid color-mix(in srgb, var(--vc-yellow) 40%, transparent);
    transition: all 0.2s ease;
  }

  .warning-badge-wrapper:hover .warning-badge {
    background: color-mix(in srgb, var(--vc-yellow) 35%, transparent);
  }

  .warning-badge ha-icon {
    --mdc-icon-size: 14px;
  }

  .warning-tooltip {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: max-content;
    max-width: 320px;
    white-space: normal;
    background: var(--ha-card-background, var(--card-background-color, #1c1c1e));
    color: var(--primary-text-color, #fff);
    border: 1px solid color-mix(in srgb, var(--vc-yellow) 40%, transparent);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
    z-index: 100;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-4px);
    transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s ease;
    pointer-events: none;
  }

  .warning-badge-wrapper:hover .warning-tooltip,
  .warning-badge-wrapper:focus-within .warning-tooltip {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }

  .warning-tooltip-title {
    font-weight: 600;
    color: var(--vc-yellow);
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    font-size: 12px;
  }

  .warning-tooltip-title ha-icon {
    --mdc-icon-size: 16px;
  }

  .warning-issue-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .warning-issue-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 11px;
    color: var(--primary-text-color);
  }

  .warning-issue-item ha-icon {
    --mdc-icon-size: 14px;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .warning-issue-item.severity-error {
    color: var(--vc-red, #ff5252);
  }

  .warning-issue-item.severity-warning {
    color: var(--vc-yellow, #e6a23c);
  }

  /* Diagnostics Banner */
  .health-banner {
    background: color-mix(in srgb, var(--vc-yellow) 10%, var(--secondary-background-color));
    border: 1px solid color-mix(in srgb, var(--vc-yellow) 30%, transparent);
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: var(--vc-spacing);
    font-size: 12px;
  }

  .health-banner-title {
    font-weight: 600;
    color: var(--vc-yellow);
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .health-banner-title ha-icon {
    --mdc-icon-size: 16px;
  }

  .health-issue-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding-left: 0;
    list-style: none;
  }

  .health-issue-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: var(--primary-text-color);
  }

  .health-issue-item ha-icon {
    --mdc-icon-size: 14px;
    color: var(--vc-yellow);
    flex-shrink: 0;
    margin-top: 1px;
  }

  .card-content {
    padding: 12px var(--vc-spacing) var(--vc-spacing) var(--vc-spacing);
  }

  /* ── Outdoor section (Flat & Unboxed) ───────────────────────── */
  .outdoor-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 0 14px 0;
    border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
    margin-bottom: 4px;
  }

  .outdoor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
  }

  .outdoor-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .outdoor-icon-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--vc-blue, #2196f3) 14%, transparent);
    color: var(--vc-blue, #2196f3);
  }

  .outdoor-icon-avatar ha-icon {
    --mdc-icon-size: 17px;
  }

  .outdoor-name {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--secondary-text-color);
  }

  .outdoor-weather-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 500;
    text-transform: capitalize;
    padding: 2px 8px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--vc-blue, #2196f3) 12%, transparent);
    color: var(--vc-blue, #2196f3);
    white-space: nowrap;
    transition: background-color 0.2s ease;
  }

  .outdoor-weather-badge ha-icon {
    --mdc-icon-size: 15px;
  }

  .outdoor-header-badges {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .outdoor-details-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
    color: var(--secondary-text-color);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .outdoor-details-trigger:hover {
    background: color-mix(in srgb, var(--primary-color) 20%, transparent);
    color: var(--primary-color);
  }

  .outdoor-details-trigger ha-icon {
    --mdc-icon-size: 16px;
  }

  .climate-pill-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 500;
    padding: 3px 9px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
    color: var(--primary-text-color);
    white-space: nowrap;
    transition: background 0.15s ease;
  }

  .climate-pill-badge.clickable {
    cursor: pointer;
  }

  .climate-pill-badge.clickable:hover {
    background: color-mix(in srgb, var(--primary-color) 18%, transparent);
    color: var(--primary-color);
  }

  .climate-pill-badge ha-icon {
    --mdc-icon-size: 14px;
    color: var(--secondary-text-color);
  }

  .climate-pill-badge .pill-humidity-icon {
    margin-left: 3px;
  }

  .outdoor-expanded-panel {
    margin-top: 8px;
    margin-left: 0;
    padding-top: 0;
    border-top: none;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: vc-slide-down 0.18s ease-out;
  }

  /* ── Integrated Home Assistant Style Sparkline Line Graph ──────── */
  .integrated-graph-card {
    position: relative;
    background: transparent;
    border: none;
    box-shadow: none;
    border-radius: 0;
    padding: 6px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
  }

  .graph-floating-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 2;
  }

  .graph-current-stats {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .weighty-stat {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .weighty-stat .stat-icon {
    --mdc-icon-size: 16px;
    color: var(--primary-color);
    align-self: center;
  }

  .weighty-stat .stat-icon.hum {
    color: var(--vc-blue, #2196f3);
  }

  .weighty-stat .weighty-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--primary-text-color);
    line-height: 1;
    letter-spacing: -0.5px;
  }

  .weighty-stat .weighty-unit {
    font-size: 12px;
    font-weight: 500;
    color: var(--secondary-text-color);
  }

  .graph-range-pill {
    font-size: 11px;
    font-weight: 500;
    color: var(--secondary-text-color);
    background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
    padding: 2px 8px;
    border-radius: 10px;
  }

  .graph-svg-wrapper {
    width: 100%;
    height: 70px;
    position: relative;
    margin-top: 4px;
  }

  .forecast-svg-chart {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }

  .graph-time-axis {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    color: var(--secondary-text-color);
    padding-top: 4px;
    border-top: 1px dashed var(--divider-color, rgba(255, 255, 255, 0.08));
  }

  .outdoor-forecast-empty {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--secondary-text-color);
    padding: 6px 0;
  }

  .outdoor-values {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 16px;
    font-size: 13px;
    color: var(--primary-text-color);
    padding: 2px 0 0 36px;
  }

  .outdoor-values .sensor-value {
    display: flex;
    align-items: baseline;
    gap: 3px;
    white-space: nowrap;
    padding: 2px 6px;
    border-radius: 4px;
    transition: background-color 0.15s ease;
  }

  .outdoor-values .sensor-value ha-icon {
    --mdc-icon-size: 15px;
    color: var(--secondary-text-color);
    opacity: 0.8;
    align-self: center;
  }

  .outdoor-values .value {
    font-weight: 600;
    font-size: 14px;
  }

  .outdoor-values .unit {
    font-size: 11px;
    color: var(--secondary-text-color);
    font-weight: 400;
  }

  /* ── Room rows (Flat List with Dividers) ────────────────────── */
  .room-list {
    display: flex;
    flex-direction: column;
  }

  .room-row {
    padding: 14px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
    transition: background-color 0.15s ease;
  }

  .room-row:last-child {
    border-bottom: none;
    padding-bottom: 4px;
  }

  .room-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .room-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .room-icon-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .room-icon-avatar ha-icon {
    --mdc-icon-size: 18px;
  }

  .room-icon-avatar.status-ventilate_now {
    background: color-mix(in srgb, var(--vc-green) 16%, transparent);
    color: var(--vc-green);
  }

  .room-icon-avatar.status-do_not_ventilate {
    background: color-mix(in srgb, var(--vc-red) 12%, transparent);
    color: var(--vc-red);
  }

  .room-icon-avatar.status-caution {
    background: color-mix(in srgb, var(--vc-yellow) 16%, transparent);
    color: var(--vc-yellow);
  }

  .room-icon-avatar.status-unknown {
    background: color-mix(in srgb, var(--disabled-text-color, #999) 12%, transparent);
    color: var(--disabled-text-color, #999);
  }

  .room-name {
    font-size: 15px;
    font-weight: 500;
    color: var(--primary-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .room-header-badges {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .suggestion-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 14px;
    white-space: nowrap;
    transition: all 0.2s ease;
  }

  .suggestion-badge ha-icon {
    --mdc-icon-size: 15px;
  }

  .suggestion-badge.status-ventilate_now {
    background: color-mix(in srgb, var(--vc-green) 16%, transparent);
    color: var(--vc-green);
  }

  .suggestion-badge.status-do_not_ventilate {
    background: color-mix(in srgb, var(--vc-red) 12%, transparent);
    color: var(--vc-red);
  }

  .suggestion-badge.status-caution {
    background: color-mix(in srgb, var(--vc-yellow) 16%, transparent);
    color: var(--vc-yellow);
  }

  .suggestion-badge.status-unknown {
    background: color-mix(in srgb, var(--disabled-text-color, #999) 12%, transparent);
    color: var(--disabled-text-color, #999);
  }

  /* ── Room Stats (Unboxed & Clean) ──────────────────────────── */
  .room-values {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 16px;
    font-size: 13px;
    color: var(--primary-text-color);
    padding: 0 0 0 42px;
  }

  .room-values .sensor-value {
    display: flex;
    align-items: baseline;
    gap: 3px;
    white-space: nowrap;
    padding: 2px 6px;
    border-radius: 4px;
    transition: background-color 0.15s ease;
  }

  .room-values .sensor-value ha-icon {
    --mdc-icon-size: 15px;
    color: var(--secondary-text-color);
    opacity: 0.85;
    align-self: center;
  }

  .room-values .value {
    font-weight: 600;
    font-size: 14px;
  }

  .room-values .unit {
    font-size: 11px;
    color: var(--secondary-text-color);
    font-weight: 400;
  }

  /* Custom outdoor for this room */
  .room-outdoor {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--secondary-text-color);
    margin-left: 0;
  }

  .room-outdoor ha-icon {
    --mdc-icon-size: 13px;
  }

  /* Info Icon Tooltip */
  .info-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 1px;
    border-radius: 4px;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .info-icon {
    --mdc-icon-size: 16px;
    color: inherit;
    opacity: 0.85;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .info-icon-wrapper:hover .info-icon,
  .info-icon-wrapper:focus .info-icon,
  .info-icon-wrapper:active .info-icon {
    opacity: 1;
    transform: scale(1.15);
  }

  .info-tooltip {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: max-content;
    max-width: 260px;
    white-space: normal;
    background: var(--ha-card-background, var(--card-background-color, #1c1c1e));
    color: var(--primary-text-color, #fff);
    border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.15));
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.35;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s ease;
    transform: translateY(-4px);
    z-index: 100;
  }

  .info-tooltip::after {
    content: '';
    position: absolute;
    bottom: 100%;
    right: 6px;
    border-width: 5px;
    border-style: solid;
    border-color: transparent transparent var(--ha-card-background, var(--card-background-color, #1c1c1e)) transparent;
  }

  .info-icon-wrapper:hover .info-tooltip,
  .info-icon-wrapper:focus .info-tooltip,
  .info-icon-wrapper:focus-within .info-tooltip,
  .info-icon-wrapper:active .info-tooltip {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }

  /* ── Forecast time hint ───────────────────────────────────── */
  .room-forecast-hint {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--secondary-text-color);
    margin-left: 0;
  }

  .room-forecast-hint ha-icon {
    --mdc-icon-size: 14px;
  }

  /* ── Window status ────────────────────────────────────────── */
  .window-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
  }

  .window-badge ha-icon {
    --mdc-icon-size: 14px;
  }

  .window-badge.window-correct {
    background: color-mix(in srgb, var(--vc-green) 15%, transparent);
    color: var(--vc-green);
  }

  .window-badge.window-incorrect {
    background: color-mix(in srgb, var(--vc-red) 15%, transparent);
    color: var(--vc-red);
  }

  /* ── Interactive Clickable Elements ───────────────────────── */
  .clickable {
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.15s ease, opacity 0.15s ease, background-color 0.15s ease;
  }

  .clickable:hover {
    opacity: 0.85;
  }

  .sensor-value.clickable:hover {
    background: color-mix(in srgb, var(--primary-color, #2196f3) 12%, transparent);
  }

  .room-title-group.clickable:hover {
    opacity: 0.85;
  }

  .room-icon-avatar.clickable:hover {
    transform: scale(1.06);
  }

  .window-badge.clickable:hover {
    transform: scale(1.04);
  }

  .suggestion-badge.clickable:hover {
    transform: scale(1.04);
  }

  .outdoor-title-group.clickable:hover {
    opacity: 0.85;
  }

  /* ── Upcoming Ventilation Windows (Clean & Integrated List) ─── */
  .forecast-windows-section {
    margin-top: 6px;
    margin-left: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .windows-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--secondary-text-color);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .windows-header ha-icon {
    --mdc-icon-size: 14px;
    color: var(--primary-color, #2196f3);
  }

  .windows-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 2px;
  }

  .window-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 3px 8px;
    border-left: 2px solid var(--divider-color, rgba(255, 255, 255, 0.15));
    font-size: 12px;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }

  .window-row.active-window {
    border-left-color: var(--vc-green, #4caf50);
    background: color-mix(in srgb, var(--vc-green, #4caf50) 8%, transparent);
    border-radius: 0 4px 4px 0;
  }

  .window-time-range {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
    color: var(--primary-text-color);
  }

  .window-time-range .arrow-icon {
    --mdc-icon-size: 14px;
    color: var(--secondary-text-color);
  }

  .window-badge-meta {
    flex-shrink: 0;
  }

  .active-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--vc-green, #4caf50);
  }

  .active-tag ha-icon {
    --mdc-icon-size: 13px;
  }

  .duration-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 500;
    color: var(--secondary-text-color);
  }

  .duration-tag ha-icon {
    --mdc-icon-size: 12px;
  }

  .forecast-windows-empty {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--secondary-text-color);
    margin-left: 0;
    margin-top: 4px;
  }

  .forecast-windows-empty ha-icon {
    --mdc-icon-size: 15px;
  }

  /* ── Skeleton loading ─────────────────────────────────────── */
  .skeleton-content {
    padding: var(--vc-spacing);
  }

  .skeleton {
    background: linear-gradient(
      90deg,
      var(--secondary-background-color) 25%,
      color-mix(in srgb, var(--secondary-background-color) 50%, transparent) 50%,
      var(--secondary-background-color) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  .skeleton-outdoor {
    height: 40px;
    border-radius: 4px;
    margin-bottom: var(--vc-spacing);
  }

  .skeleton-room {
    height: 60px;
    border-radius: 4px;
    margin-bottom: 8px;
  }

  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }

  /* ── Compact Next Window Summary Chip ───────────────────── */
  .compact-next-window-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--primary-text-color) 4%, transparent);
    color: var(--primary-text-color);
    border: 1px solid color-mix(in srgb, var(--primary-text-color) 12%, transparent);
    cursor: pointer;
    transition: all 0.15s ease;
    margin-left: 0;
    margin-top: 4px;
    width: fit-content;
  }

  .compact-next-window-chip:hover {
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    border-color: var(--primary-color);
  }

  .compact-next-window-chip.is-active {
    background: color-mix(in srgb, var(--vc-green) 10%, transparent);
    color: var(--vc-green);
    border-color: color-mix(in srgb, var(--vc-green) 30%, transparent);
  }

  .compact-next-window-chip.is-active:hover {
    background: color-mix(in srgb, var(--vc-green) 20%, transparent);
  }

  .compact-next-window-chip ha-icon {
    --mdc-icon-size: 14px;
    flex-shrink: 0;
  }

  /* ── Room Details Trigger Button ──────────────────────────── */
  .room-details-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
    color: var(--secondary-text-color);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .room-details-trigger:hover {
    background: color-mix(in srgb, var(--primary-color) 20%, transparent);
    color: var(--primary-color);
  }

  .room-details-trigger ha-icon {
    --mdc-icon-size: 16px;
  }

  /* ── Subpage Navigation (Native HA In-Card Navigation) ──── */
  .subpage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--vc-spacing) var(--vc-spacing) 12px var(--vc-spacing);
    border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
    gap: 12px;
  }

  .subpage-back-button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
    color: var(--primary-text-color);
    border: none;
    padding: 6px 12px;
    border-radius: 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .subpage-back-button:hover {
    background: color-mix(in srgb, var(--primary-color) 20%, transparent);
    color: var(--primary-color);
  }

  .subpage-back-button ha-icon {
    --mdc-icon-size: 18px;
  }

  .subpage-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .subpage-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--primary-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .subpage-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: var(--vc-spacing);
  }

  .subpage-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .subpage-section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--primary-text-color);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .subpage-section-title ha-icon {
    --mdc-icon-size: 16px;
    color: var(--primary-color);
  }

  .suggestion-banner {
    background: color-mix(in srgb, var(--primary-text-color) 5%, transparent);
    border-radius: 12px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
  }

  .suggestion-banner.status-ventilate_now {
    background: color-mix(in srgb, var(--vc-green) 12%, transparent);
    border-color: color-mix(in srgb, var(--vc-green) 30%, transparent);
    color: var(--vc-green);
  }

  .suggestion-banner.status-do_not_ventilate {
    background: color-mix(in srgb, var(--vc-red) 10%, transparent);
    border-color: color-mix(in srgb, var(--vc-red) 25%, transparent);
    color: var(--vc-red);
  }

  .suggestion-banner.status-caution {
    background: color-mix(in srgb, var(--vc-yellow) 12%, transparent);
    border-color: color-mix(in srgb, var(--vc-yellow) 30%, transparent);
    color: var(--vc-yellow);
  }

  .suggestion-banner-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .suggestion-banner-header ha-icon {
    --mdc-icon-size: 20px;
  }

  .suggestion-title {
    font-size: 14px;
    font-weight: 700;
  }

  .suggestion-reason {
    font-size: 12px;
    color: var(--primary-text-color);
    opacity: 0.9;
    line-height: 1.4;
  }

  /* ── Inline Expandable Room Panels (Clean & Unboxed) ─────── */
  .room-row {
    cursor: pointer;
    transition: background 0.15s ease;
    padding: 12px 0;
    border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
  }

  .room-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .room-expanded-panel {
    margin-top: 8px;
    margin-left: 0;
    padding-top: 0;
    border-top: none;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: vc-slide-down 0.18s ease-out;
  }

  @keyframes vc-slide-down {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .expanded-reason-box {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--primary-text-color);
    padding: 4px 0;
  }

  .expanded-reason-box ha-icon {
    --mdc-icon-size: 16px;
    color: var(--primary-color);
    flex-shrink: 0;
    margin-top: 1px;
  }

  .expanded-section-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--secondary-text-color);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
  }

  .expanded-section-title ha-icon {
    --mdc-icon-size: 14px;
    color: var(--primary-color);
  }

  .room-values-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .room-values-block .block-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--secondary-text-color);
  }

  .room-values-block .block-label ha-icon {
    --mdc-icon-size: 15px;
    color: var(--primary-color);
  }

  .room-expanded-panel .room-values {
    padding-left: 0;
  }

  .room-expanded-panel .forecast-windows-section,
  .room-expanded-panel .forecast-windows-empty {
    margin-left: 0;
  }

  /* ── Responsive ───────────────────────────────────────────── */
  @media (max-width: 400px) {
    .outdoor-values,
    .room-values {
      gap: 10px;
      padding-left: 0;
    }

    .room-outdoor,
    .room-forecast-hint,
    .forecast-windows-section,
    .forecast-windows-empty,
    .compact-next-window-chip,
    .room-expanded-panel {
      margin-left: 0;
    }

    .sensor-value {
      font-size: 12px;
    }

    .climate-grid {
      grid-template-columns: 1fr;
    }
  }

  /* ── Interactive Graph Hover & Crosshair ───────────────────── */
  .graph-svg-wrapper {
    position: relative;
    width: 100%;
    cursor: crosshair;
    touch-action: none;
  }

  .hover-crosshair {
    stroke: var(--primary-color, #2196f3);
    stroke-width: 1;
    stroke-dasharray: 3 3;
    opacity: 0.8;
  }

  .hover-marker {
    fill: var(--ha-card-background, var(--card-background-color, #1c1c1e));
    stroke-width: 2.5;
    transition: r 0.1s ease;
  }

  .graph-floating-header .hover-time-tag {
    font-size: 11px;
    font-weight: 600;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: 4px;
  }

  /* ── Next State Change Badge ────────────────────────────────── */
  .next-state-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
    border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
    color: var(--primary-text-color);
    transition: all 0.2s ease;
  }

  .next-state-chip.to-open {
    background: color-mix(in srgb, var(--vc-green) 14%, transparent);
    border-color: color-mix(in srgb, var(--vc-green) 30%, transparent);
    color: var(--vc-green);
  }

  .next-state-chip.to-closed {
    background: color-mix(in srgb, var(--vc-yellow) 14%, transparent);
    border-color: color-mix(in srgb, var(--vc-yellow) 30%, transparent);
    color: var(--vc-yellow);
  }

  .next-state-chip ha-icon {
    --mdc-icon-size: 13px;
  }

  /* ── Room Temperature Prediction Graph ─────────────────────── */
  .prediction-graph-card {
    background: color-mix(in srgb, var(--primary-text-color) 3%, transparent);
    border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .prediction-legend {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11px;
    color: var(--secondary-text-color);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .legend-color {
    width: 10px;
    height: 3px;
    border-radius: 2px;
  }

  .legend-color.predicted-room {
    background: var(--vc-green, #10b981);
  }

  .legend-color.outdoor-reference {
    background: var(--primary-color, #2196f3);
    border-top: 1px dashed var(--primary-color, #2196f3);
  }

  .legend-color.openable-zone {
    background: color-mix(in srgb, var(--vc-green) 40%, transparent);
    height: 8px;
    border-radius: 2px;
  }

  .openable-zone-band {
    fill: var(--vc-green, #10b981);
    opacity: 0.15;
  }

  /* ── Unified Outdoor Accordion Row ──────────────────────────── */
  .outdoor-section {
    margin-bottom: var(--vc-spacing);
    border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
    padding-bottom: 12px;
  }

  .outdoor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
    padding: 4px 0;
  }

  .outdoor-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .outdoor-icon-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    color: var(--primary-color);
  }

  .outdoor-icon-avatar ha-icon {
    --mdc-icon-size: 18px;
  }

  .outdoor-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--primary-text-color);
  }
`;


