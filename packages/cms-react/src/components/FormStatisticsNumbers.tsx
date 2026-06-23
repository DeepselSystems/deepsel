import React, { memo, useMemo } from 'react';
import clsx from 'clsx';
import { alpha, Tooltip } from '@mantine/core';
import { CompositeChart } from '@mantine/charts';
import { useTranslation } from 'react-i18next';
import { FORM_FIELD_TYPE, type FormField, type FormSubmission } from '@deepsel/cms-utils';
import { useSubmissionStatisticsData } from '../hooks/useSubmissionStatisticsData.js';

const COUNT_KEY = 'Count';
const DENSITY_KEY = 'Density Plot';

/** Gaussian kernel for KDE */
function gaussianKernel(x: number, xi: number, bandwidth: number): number {
  const z = (x - xi) / bandwidth;
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/** Kernel Density Estimation at point x */
function calculateKDE(x: number, data: number[], bandwidth: number): number {
  if (data.length === 0) return 0;
  return (
    data.reduce((acc, xi) => acc + gaussianKernel(x, xi, bandwidth), 0) / (data.length * bandwidth)
  );
}

interface StatisticItemProps {
  label: string;
  value: string | number;
  description?: string;
}

/** Custom tooltip for the composite chart */
const ChartTooltip = memo(
  ({
    label,
    payload,
  }: {
    label: string;
    payload?: { name: string; value: number; color: string }[];
  }) => {
    if (!payload) return null;
    return (
      <div className="form-statistics-numbers__chart-tooltip">
        <div className="form-statistics-numbers__chart-tooltip-label">{label}</div>
        {payload.map((item) => (
          <div
            key={item.name}
            className="form-statistics-numbers__chart-tooltip-row"
            style={{ color: alpha(item.color, 1) }}
          >
            <span>{item.name}: </span>
            <span>{item.name === DENSITY_KEY ? item.value.toFixed(4) : item.value}</span>
          </div>
        ))}
      </div>
    );
  },
);
ChartTooltip.displayName = 'ChartTooltip';

/** Single stat card (label + value + optional tooltip) */
const StatisticItem = memo(({ label, value, description }: StatisticItemProps) => (
  <div className="stat-item">
    <div className="stat-item__inner">
      <div className="stat-item__content">
        <p className="stat-item__label">{label}</p>
        <p className="stat-item__value">{value}</p>
      </div>
      {description && (
        <Tooltip label={description} multiline maw={300} withArrow>
          <button type="button" className="stat-item__info-btn">
            ⓘ
          </button>
        </Tooltip>
      )}
    </div>
  </div>
));
StatisticItem.displayName = 'StatisticItem';

interface FormStatisticsNumbersProps {
  formField: FormField;
  formSubmissions: FormSubmission[];
  className?: string;
}

/**
 * Composite bar+density chart and statistical summary for number fields.
 */
export function FormStatisticsNumbers({
  formField,
  formSubmissions,
  className,
}: FormStatisticsNumbersProps) {
  const { t } = useTranslation();
  const { fieldSubmissions } = useSubmissionStatisticsData(formField, formSubmissions);

  const barChartSeries = useMemo(
    () => [
      { name: COUNT_KEY, type: 'bar' as const },
      { name: DENSITY_KEY, type: 'line' as const, yAxisId: 'right', color: 'gray' },
    ],
    [],
  );

  const sortedSubmissions = useMemo(
    () =>
      fieldSubmissions
        .filter(
          (s) =>
            (s.field_snap_short as Record<string, unknown>)?.['field_type'] ===
              FORM_FIELD_TYPE.Number && !isNaN(Number(s.value)),
        )
        .sort((a, b) => Number(a.value) - Number(b.value)),
    [fieldSubmissions],
  );

  /** Group by value key */
  const groupByNumber = useMemo(() => {
    const map: Record<string, typeof sortedSubmissions> = {};
    for (const s of sortedSubmissions) {
      const key = String(s.value);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [sortedSubmissions]);

  /** KDE bandwidth via Scott's rule */
  const bandwidth = useMemo(() => {
    const values = sortedSubmissions.map((s) => Number(s.value));
    const n = values.length;
    if (n === 0) return 1;
    const avg = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, v) => a + Math.pow(v - avg, 2), 0) / n;
    return Math.pow(n, -1 / 5) * Math.sqrt(variance) * 0.8 || 1;
  }, [sortedSubmissions]);

  const kdeData = useMemo(() => {
    const values = sortedSubmissions.map((s) => Number(s.value));
    if (values.length === 0) return [];
    const uniqueValues = [...new Set(Object.keys(groupByNumber).map(parseFloat))].sort(
      (a, b) => a - b,
    );
    return uniqueValues.map((x) => ({ value: x, density: calculateKDE(x, values, bandwidth) }));
  }, [sortedSubmissions, groupByNumber, bandwidth]);

  const barChartData = useMemo(() => {
    if (sortedSubmissions.length === 0) return [];
    const kdeMap = new Map(kdeData.map((d) => [String(d.value), d.density]));
    return Object.keys(groupByNumber).map((key) => ({
      label: key,
      [COUNT_KEY]: groupByNumber[key].length,
      [DENSITY_KEY]: kdeMap.get(key) ?? 0,
    }));
  }, [groupByNumber, sortedSubmissions.length, kdeData]);

  const statistics = useMemo(() => {
    const values = sortedSubmissions.map((s) => Number(s.value));
    const n = values.length;
    if (n === 0)
      return {
        min: null,
        max: null,
        mean: null,
        median: null,
        standardDeviation: null,
        skewness: null,
        kurtosis: null,
        numberOfAnswers: 0,
      };

    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / n;
    const sorted = [...values].sort((a, b) => a - b);
    const median =
      n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    const variance = values.reduce((a, v) => a + Math.pow(v - avg, 2), 0) / n;
    const sd = Math.sqrt(variance);
    const skewness = sd === 0 ? 0 : values.reduce((a, v) => a + Math.pow((v - avg) / sd, 3), 0) / n;
    const kurtosis =
      sd === 0 ? 0 : values.reduce((a, v) => a + Math.pow((v - avg) / sd, 4), 0) / n - 3;

    return {
      min,
      max,
      mean: avg,
      median,
      standardDeviation: sd,
      skewness,
      kurtosis,
      numberOfAnswers: n,
    };
  }, [sortedSubmissions]);

  const statsItems = useMemo(
    () => [
      {
        label: t('Number of Answers'),
        value: statistics.numberOfAnswers,
        description: t('Total number of responses received for this field'),
      },
      {
        label: t('Min'),
        value: statistics.min ?? 'N/A',
        description: t('The smallest value in the dataset'),
      },
      {
        label: t('Max'),
        value: statistics.max ?? 'N/A',
        description: t('The largest value in the dataset'),
      },
      {
        label: t('Mean'),
        value: statistics.mean != null ? statistics.mean.toFixed(2) : 'N/A',
        description: t('Average value'),
      },
      {
        label: t('Median'),
        value: statistics.median != null ? statistics.median.toFixed(2) : 'N/A',
        description: t('The middle value when all values are sorted'),
      },
      {
        label: t('Standard Deviation'),
        value:
          statistics.standardDeviation != null ? statistics.standardDeviation.toFixed(2) : 'N/A',
        description: t('Measures spread from the mean'),
      },
      {
        label: t('Skewness'),
        value: statistics.skewness != null ? statistics.skewness.toFixed(2) : 'N/A',
        description: t('Asymmetry of the distribution'),
      },
      {
        label: t('Kurtosis'),
        value: statistics.kurtosis != null ? statistics.kurtosis.toFixed(2) : 'N/A',
        description: t('Tailedness of the distribution'),
      },
    ],
    [statistics, t],
  );

  return (
    <div className={clsx('form-statistics-numbers', className)}>
      <div className="form-statistics-numbers__header">
        <h2 className="form-statistics-numbers__label">{formField.label}</h2>
        {formField.description && (
          <p className="form-statistics-numbers__description">{formField.description}</p>
        )}
      </div>

      <div className="form-statistics-numbers__stats-section">
        <h3 className="form-statistics-numbers__stats-section-title">{t('Statistical Summary')}</h3>
        <div className="form-statistics-numbers__stats-grid">
          {statsItems.map((item, i) => (
            <StatisticItem
              key={i}
              label={item.label}
              value={item.value}
              description={item.description}
            />
          ))}
        </div>
      </div>

      <div className="form-statistics-numbers__chart">
        <h3 className="form-statistics-numbers__chart-title">{t('Response Count Chart')}</h3>
        <div className="form-statistics-numbers__chart-area">
          <CompositeChart
            withLegend
            withRightYAxis
            h={300}
            dataKey="label"
            data={barChartData}
            series={barChartSeries}
            curveType="natural"
            tickLine="y"
            maxBarWidth={30}
            tooltipAnimationDuration={200}
            rightYAxisLabel={DENSITY_KEY}
            yAxisLabel={COUNT_KEY}
            tooltipProps={{
              content: ({ label, payload }) => (
                <ChartTooltip
                  label={`${formField.label}: ${label}`}
                  payload={payload as { name: string; value: number; color: string }[]}
                />
              ),
            }}
          />
        </div>
      </div>
    </div>
  );
}
