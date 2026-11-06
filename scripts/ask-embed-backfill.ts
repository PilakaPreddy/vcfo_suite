import './load-env';

import { getEmbeddingProvider } from '@/lib/ask/embeddings';
import { backfillEmbeddings } from '@/lib/ask/embeddings/backfill';

/** Embeds every chunk and card with no vector or an old model's. Usage: npm run ask:embed */
async function main() {
  const provider = getEmbeddingProvider();
  if (!provider) {
    console.log('ASK_EMBEDDINGS_PROVIDER is none, so there is nothing to do. Search runs on full text.');
    return;
  }
  console.log(`embedded with ${provider.model}`, await backfillEmbeddings());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
