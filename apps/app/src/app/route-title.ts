export function loaderCrumb(loaderData: unknown) {
  const crumb = (loaderData as { crumb?: unknown } | undefined)?.crumb;
  return typeof crumb === 'string' ? crumb : undefined;
}

// A loader whose crumb is a person's name returns `crumbIsPersonal: true`, and the session
// replay masks it.
export function personalCrumb(loaderData: unknown) {
  return (loaderData as { crumbIsPersonal?: unknown } | undefined)?.crumbIsPersonal === true;
}
