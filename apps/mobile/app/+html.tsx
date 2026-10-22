import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();
  return <html lang="en" {...htmlAttributes}><head><meta charSet="utf-8"/><meta httpEquiv="X-UA-Compatible" content="IE=edge"/><meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no"/><ScrollViewStyleReset/><style dangerouslySetInnerHTML={{__html:'body{background:#080808}'}}/>{headNodes}</head><body {...bodyAttributes}>{children}{bodyNodes}</body></html>;
}
