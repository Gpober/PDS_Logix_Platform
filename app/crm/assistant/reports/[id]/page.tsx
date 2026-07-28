import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAssistantReport, getCurrentProfile } from '@/lib/crm/data';
import { deleteAssistantReport } from '@/lib/crm/actions';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { ReportBlocks } from '@/components/crm/ReportBlocks';
import { PrintReportButton } from '@/components/crm/PrintReportButton';

export const dynamic = 'force-dynamic';

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) {
    return (
      <>
        <CrmHeader title="Report" />
        <Empty>Reports are owner/admin-only and aren’t available on your account.</Empty>
      </>
    );
  }

  const { id } = await params;
  const report = await getAssistantReport(id);
  if (!report) notFound();

  const dateLabel = new Date(report.created_at).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-6 flex items-center justify-between gap-4">
        <Link href="/crm/assistant/reports" className="text-sm text-stone hover:text-ink">
          ← Reports
        </Link>
        <div className="flex items-center gap-2">
          <PrintReportButton />
          <form action={deleteAssistantReport}>
            <input type="hidden" name="id" value={report.id} />
            <button className="rounded-full border border-line px-3 py-1.5 text-xs text-stone hover:border-tulip hover:text-tulip">
              Delete
            </button>
          </form>
        </div>
      </div>

      <div id="report-print-area">
        <header className="mb-6 border-b border-line pb-4">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-stone">
            <span className="font-medium text-tulip-dark">PDS Logix</span>
            <span>Confidential</span>
          </div>
          <h1 className="mt-3 font-display text-3xl">{report.title}</h1>
          {report.summary && <p className="mt-1 max-w-2xl text-stone">{report.summary}</p>}
          <p className="mt-1 text-xs text-stone">{dateLabel}</p>
        </header>

        {report.blocks.length === 0 ? <Empty>This report has no content.</Empty> : <ReportBlocks blocks={report.blocks} />}
      </div>
    </div>
  );
}
