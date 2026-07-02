import { listIntakes } from '@/lib/finance/data-source';
import { IntakesClient } from './intakes-client';

export const dynamic = 'force-dynamic';

export default async function IntakesPage() {
  const intakes = await listIntakes();
  return (
    <div className="wb-scene wb-stack wb-stack--lg">
      <IntakesClient intakes={intakes} />
    </div>
  );
}
