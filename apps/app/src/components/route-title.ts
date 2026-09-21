export function loaderCrumb(loaderData: unknown) {
  const crumb = (loaderData as { crumb?: unknown } | undefined)?.crumb;
  return typeof crumb === 'string' ? crumb : undefined;
}
