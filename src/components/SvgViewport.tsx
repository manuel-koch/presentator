interface Props {
  content: string;
}

export function SvgViewport({ content }: Props) {
  return (
    <div
      className="svg-viewport"
      data-testid="svg-viewport"
      // SVG content comes from a user-selected local file — inline rendering is intentional.
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
