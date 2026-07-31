import { ProspectForm } from '@/components/admin/ProspectForm';

export default function NewProspectPage() {
  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="font-display font-condensed text-2xl font-bold uppercase tracking-wide">New prospect</h1>
      <p className="mt-1 text-base text-rule">
        Record signals before you pitch. The verdict updates as you fill this in.
      </p>
      <div className="mt-6">
        <ProspectForm />
      </div>
    </div>
  );
}
