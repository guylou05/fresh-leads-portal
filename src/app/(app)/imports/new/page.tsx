import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { env } from "@/env";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { UploadForm } from "@/components/imports/upload-form";

export const metadata: Metadata = { title: "New import" };

export default async function NewImportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <PageHeader
        title="Upload a business report"
        description="Upload an Ohio Secretary of State report (.txt or .csv). You'll preview and confirm before anything is imported."
        action={
          <Link
            href="/imports"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            ← Back to imports
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Select a file"
            description="Ohio .TXT reports are comma-delimited and fully supported."
          />
          <CardBody>
            <UploadForm maxSizeMb={env.MAX_IMPORT_FILE_SIZE_MB} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="What happens next" />
          <CardBody>
            <ol className="space-y-3 text-sm text-slate-600">
              {[
                "We validate the file type and size.",
                "The header is parsed and columns are auto-mapped.",
                "A preview of the first rows is generated.",
                "Duplicates are estimated against existing records.",
                "You confirm before any data is imported.",
              ].map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
