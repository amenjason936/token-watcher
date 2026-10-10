/** 本地自然日零点；按日历移动，跨夏令时也不多算或少算一天。 */
export function localDayStart(now = Date.now(), offset = 0) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.getTime();
}

/** 含今天的最近 N 个本地自然日；0 表示全部历史。 */
export function localRangeStart(days, now = Date.now()) {
  return days > 0 ? localDayStart(now, 1 - days) : 0;
}
