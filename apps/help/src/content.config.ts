import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';
import { defineCollection } from 'astro:content';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    // Read by the tooling only; no page or search index renders them (ADR 028).
    schema: docsSchema({
      extend: z.object({
        topics: z
          .array(
            z.object({
              id: z.string().regex(/^[a-z0-9-]+\.[a-z0-9-]+$/),
              heading: z.string(),
            })
          )
          .default([]),
        sources: z.array(z.string()).default([]),
      }),
    }),
  }),
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
