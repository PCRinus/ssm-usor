// Only what the documents proposed collapses when switched off: a row proposed off stays open,
// since it says why it is off.
export const leftOutByMember = (included: boolean, proposed: boolean) => !included && proposed;
