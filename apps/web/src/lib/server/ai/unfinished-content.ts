export function containsUnfinishedWorkMarker(content: string) {
  return (
    /(?:^|\n)\s*(?:(?:\/\/|#|\/\*+|\*)\s*)?(?:TODO|FIXME)(?:\s*[:-]\s*\S|\s*(?:\*\/)?\s*$)/im.test(content) ||
    /\b(?:TODO|FIXME)\b(?=\s*<\/[^>]+>)/i.test(content) ||
    /\b(?:coming soon|TBD|REPLACE_ME)\b/i.test(content)
  );
}
