// Pending counts as empty: header actions then appear once rows arrive, instead of showing
// while the list loads and vanishing when its empty state brings the same actions.
export function isEmptyOrLoading(status: 'pending' | 'error' | 'success', count: number) {
  return status !== 'error' && count === 0;
}
