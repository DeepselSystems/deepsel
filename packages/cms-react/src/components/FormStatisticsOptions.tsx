import React, { useMemo } from 'react';
import clsx from 'clsx';
import { BarChart } from '@mantine/charts';
import { useTranslation } from 'react-i18next';
import { FORM_FIELD_TYPE, type FormField, type FormSubmission } from '@deepsel/cms-utils';
import { useSubmissionStatisticsData } from '../hooks/useSubmissionStatisticsData.js';

/** Field types rendered by this component */
const SUPPORTED_TYPES = [
  FORM_FIELD_TYPE.Checkboxes,
  FORM_FIELD_TYPE.MultipleChoice,
  FORM_FIELD_TYPE.Dropdown,
] as string[];

const COUNT_KEY = 'Count';

interface FormStatisticsOptionsProps {
  formField: FormField;
  formSubmissions: FormSubmission[];
  className?: string;
}

/**
 * Bar-chart statistics for selection-type fields (checkboxes, multiple choice, dropdown).
 */
export function FormStatisticsOptions({
  formField,
  formSubmissions,
  className,
}: FormStatisticsOptionsProps) {
  const { t } = useTranslation();
  const { fieldSubmissions } = useSubmissionStatisticsData(formField, formSubmissions);

  const options =
    (formField.field_config?.options as unknown as { value: string; label: string }[]) ?? [];

  const optionMap = useMemo(() => Object.fromEntries(options.map((o) => [o.value, o])), [options]);

  const barChartSeries = useMemo(() => [{ name: COUNT_KEY }], []);

  const barChartData = useMemo(
    () =>
      Object.keys(optionMap).map((key) => ({
        label: optionMap[key].label,
        [COUNT_KEY]: fieldSubmissions.filter((s) => {
          if (
            !SUPPORTED_TYPES.includes(
              String((s.field_snap_short as Record<string, unknown>)?.['field_type']),
            )
          )
            return false;
          return Array.isArray(s.value) ? (s.value as string[]).includes(key) : s.value === key;
        }).length,
      })),
    [fieldSubmissions, optionMap],
  );

  return (
    <div className={clsx('form-statistics-options', className)}>
      <div className="form-statistics-options__header">
        <h2 className="form-statistics-options__label">{formField.label}</h2>
        {formField.description && (
          <p className="form-statistics-options__description">{formField.description}</p>
        )}
        <div className="form-statistics-options__option-badges">
          {options.map(({ label }, i) => (
            <span key={i} className="form-statistics-options__option-badge">
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="form-statistics-options__chart">
        <h3 className="form-statistics-options__chart-title">{t('Response Count Chart')}</h3>
        <div className="form-statistics-options__chart-area">
          <BarChart
            h={300}
            data={barChartData}
            series={barChartSeries}
            dataKey="label"
            tickLine="y"
            maxBarWidth={40}
          />
        </div>
      </div>
    </div>
  );
}
