export type Source = { file: string; quote: string };
export type LabelledSource = Source & {
  // What the passage proves, when it is one value of its item rather than the item itself.
  label?: string;
  // The post or room the passage stands under, which tells apart a table row repeated for each.
  near?: string;
};
