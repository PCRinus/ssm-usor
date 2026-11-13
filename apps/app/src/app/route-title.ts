export function loaderCrumb(loaderData: unknown) {
  const crumb = (loaderData as { crumb?: unknown } | undefined)?.crumb;
  return typeof crumb === 'string' ? crumb : undefined;
}

export function personalCrumb(loaderData: unknown) {
  return (loaderData as { crumbIsPersonal?: unknown } | undefined)?.crumbIsPersonal === true;
}
