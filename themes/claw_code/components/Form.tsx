import { useState, useCallback, useEffect, useMemo } from "react";
import { MantineProvider } from "@mantine/core";
import { useTranslation } from "react-i18next";
import "../i18n";
import {
  WebsiteDataProvider,
  useWebsiteData,
  FormRenderer,
  CustomCodeRenderer,
  type FormSubmitData,
} from "@deepsel/cms-react";
import {
  WebsiteDataTypes,
  FORM_FIELD_TYPE,
  type FormData,
} from "@deepsel/cms-utils";
import Menu from "./Menu";

/** Delay in ms before incrementing the view counter */
const INCREMENT_VIEWS_DELAY_MS = 3000;

/**
 * Main form component to render form page
 */
export default function Form({ data }: { data: FormData }) {
  return (
    <MantineProvider>
      <WebsiteDataProvider websiteData={{ type: WebsiteDataTypes.Form, data }}>
        {data.notFound ? <FormNotFound /> : <FormContent />}
      </WebsiteDataProvider>
    </MantineProvider>
  );
}

/**
 * Form not found state
 */
function FormNotFound() {
  const { t } = useTranslation();
  return (
    <main className="min-h-screen flex flex-col">
      <Menu />
      <div className="flex flex-col items-center justify-center flex-1 text-center gap-4 px-4">
        <h1 className="text-4xl font-bold">404</h1>
        <h2 className="text-2xl">{t("Form Not Found")}</h2>
        <p className="text-gray-400">
          {t("The form you are looking for doesn't exist or has been removed.")}
        </p>
        <a href="/" className="text-green-400 underline">
          {t("Go Back Home")}
        </a>
      </div>
    </main>
  );
}

/**
 * Form content component — handles submission logic and renders FormRenderer
 */
function FormContent() {
  const { websiteData } = useWebsiteData();
  const formData = websiteData.data as FormData;
  const { t } = useTranslation();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /** Convert latest_user_submission array → Record keyed by field_id for prefill */
  const initialFieldsData = useMemo(() => {
    if (!formData.latest_user_submission?.length) return {};
    return Object.fromEntries(
      formData.latest_user_submission.map((v) => [v.field_id, v]),
    );
  }, [formData.latest_user_submission]);

  /** Remaining submissions before the cap is hit, or null when there is no cap */
  const submissionsRemaining = useMemo(() => {
    const max = formData.max_submissions;
    if (max === null || max === undefined) return null;
    return Math.max(0, Number(max) - (formData.submissions_count || 0));
  }, [formData.max_submissions, formData.submissions_count]);

  const reachedSubmissionLimit = submissionsRemaining === 0;

  /** Increment view counter once, 3s after mount */
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch(`/api/v1/form_content/${formData.id}/increment-views`, {
        method: "PUT",
      });
    }, INCREMENT_VIEWS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [formData.id]);

  const handleSubmit = useCallback(
    (rawData: FormSubmitData): void => {
      setIsSubmitting(true);
      setSubmitError(null);

      const filesByField: Record<number, File[]> = {};
      Object.entries(rawData).forEach(([fieldId, fd]) => {
        const meta = (fd as Record<string, unknown>)._field as
          | { field_type?: string }
          | undefined;
        if (meta?.field_type === FORM_FIELD_TYPE.Files) {
          const files =
            ((fd as Record<string, unknown>).value as unknown[]) || [];
          const localFiles = files.filter((f): f is File => f instanceof File);
          if (localFiles.length > 0) filesByField[Number(fieldId)] = localFiles;
        }
      });

      const submissionData = Object.fromEntries(
        Object.entries(rawData).map(
          ([fieldId, { _error, _field, ...clean }]) => {
            if (filesByField[Number(fieldId)]) {
              return [fieldId, { ...clean, value: null }];
            }
            return [fieldId, clean];
          },
        ),
      );

      const body = new FormData();
      body.append("form_id", String(formData.form_id));
      body.append("form_content_id", String(formData.id));
      body.append("submission_data", JSON.stringify(submissionData));
      if (typeof navigator !== "undefined") {
        body.append("submitter_user_agent", navigator.userAgent);
      }

      Object.entries(filesByField).forEach(([fieldId, files]) => {
        files.forEach((file, index) => {
          body.append(`file_${fieldId}_${index}`, file, file.name);
        });
      });

      if (Object.keys(filesByField).length > 0) {
        body.append(
          "file_field_ids",
          JSON.stringify(Object.keys(filesByField).map(Number)),
        );
      }

      fetch("/api/v1/form_submission/", {
        method: "POST",
        body,
      })
        .then((res) => {
          if (!res.ok) {
            return res
              .json()
              .catch(() => ({}))
              .then((body: { detail?: string }) => {
                throw new Error(body.detail ?? `HTTP ${res.status}`);
              });
          }
          setSubmitted(true);
        })
        .catch((err: unknown) => {
          setSubmitError(
            err instanceof Error ? err.message : t("Failed to submit form"),
          );
        })
        .finally(() => setIsSubmitting(false));
    },
    [formData.form_id, formData.id, t],
  );

  return (
    <main className="min-h-screen flex flex-col">
      <Menu />

      <div className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold mb-2">{formData.title}</h1>

          {formData.description && (
            <p className="text-gray-400 mb-4">{formData.description}</p>
          )}

          {formData.show_remaining_submissions &&
            submissionsRemaining !== null && (
              <div className={`mb-4 text-sm ${reachedSubmissionLimit ? "text-red-400" : "text-yellow-400"}`}>
                {reachedSubmissionLimit
                  ? t("This form has reached its submission limit and is no longer accepting responses.")
                  : t(
                      "Limited availability: {{submissions_remaining}}/{{max_submissions}} submissions remaining.",
                      {
                        submissions_remaining: submissionsRemaining,
                        max_submissions: formData.max_submissions || 0,
                      },
                    )}
              </div>
            )}
        </div>

        <FormRenderer
          enablePrefill
          formContent={formData}
          initialFieldsData={initialFieldsData}
          loading={isSubmitting}
          submitted={submitted}
          onSubmit={handleSubmit}
        />

        {submitted && (
          <div className="mt-4 p-4 rounded-lg bg-green-900/30 border border-green-700">
            <span className="text-green-400">{formData.success_message}</span>
            {formData.enable_public_statistics &&
              typeof window !== "undefined" && (
                <a
                  className="block mt-2 text-green-400 underline"
                  href={`${window.location.href}/statistics`}
                >
                  {t("Click here to see statistics for this form.")}
                </a>
              )}
          </div>
        )}

        {!submitted && formData.closing_remarks && (
          <p className="mt-4 text-gray-400 text-sm">{formData.closing_remarks}</p>
        )}

        {submitError && (
          <p className="mt-4 text-red-400">{submitError}</p>
        )}
      </div>

      <CustomCodeRenderer
        pageData={{ form_custom_code: formData.form_custom_code }}
        contentData={formData as unknown as Record<string, unknown>}
        type="form"
        isPreviewMode={false}
      />
    </main>
  );
}
