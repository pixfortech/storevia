// Small building blocks shared by renderers. Server components only: no
// state, no effects, no client JavaScript.
import type { ImageView } from "../registry/types";

export function Image({
  image,
  sizes,
  priority,
  className,
}: {
  image: ImageView;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <img
      className={className}
      src={image.url}
      srcSet={image.srcSet || undefined}
      sizes={image.srcSet ? sizes : undefined}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      alt={image.alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
    />
  );
}
