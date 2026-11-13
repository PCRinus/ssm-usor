import { Fragment, type ReactNode } from 'react';

import { Masked } from './replay';

export function maskPeople(texts: TemplateStringsArray, ...people: ReactNode[]) {
  return (
    <>
      {texts.map((text, index) => (
        <Fragment key={index}>
          {text}
          {index < people.length && <Masked>{people[index]}</Masked>}
        </Fragment>
      ))}
    </>
  );
}
