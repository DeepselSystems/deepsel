import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useFormPrefill from '../../src/hooks/useFormPrefill';
import { FORM_FIELD_TYPE, type FormField, type FormSubmissionFieldValue } from '@deepsel/cms-utils';

/** localStorage key the hook persists all prefill data under */
const STORAGE_KEY = 'form_prefill_data';

/** Sample form slug used across tests (mirrors the shape produced by extractFormSlugFromPath) */
const FORM_SLUG = 'en/forms/weekly-report';

/** Second, distinct form slug used to verify per-form isolation */
const OTHER_FORM_SLUG = 'en/forms/other-form';

/** Builds a minimal FormField for validating prefill data against */
const buildField = (id: number): FormField => ({
  id,
  field_type: FORM_FIELD_TYPE.ShortAnswer,
  label: 'Test field',
  required: false,
  sort_order: 0,
});

/** Builds a minimal submission-data payload for a single text field */
const buildSubmissionData = (value: string): Record<string, Partial<FormSubmissionFieldValue>> => ({
  '1': { field_id: 1, field_snap_short: { field_type: FORM_FIELD_TYPE.ShortAnswer }, value },
});

describe('useFormPrefill', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips data for an anonymous visitor (no viewerId)', () => {
    const { result } = renderHook(() => useFormPrefill());

    act(() => {
      result.current.saveFormPrefillData(FORM_SLUG, buildSubmissionData('hello'));
    });

    const prefill = result.current.getFormPrefillData(FORM_SLUG, [buildField(1)]);
    expect(prefill['1']?.value).toBe('hello');
  });

  it('isolates data between different viewerIds', () => {
    const { result: userA } = renderHook(() => useFormPrefill('user-a'));
    act(() => {
      userA.current.saveFormPrefillData(FORM_SLUG, buildSubmissionData('from-a'));
    });

    // Mounted after userA's save, so they read the already-updated localStorage
    const { result: userB } = renderHook(() => useFormPrefill('user-b'));
    const { result: anon } = renderHook(() => useFormPrefill());

    expect(userB.current.getFormPrefillData(FORM_SLUG, [buildField(1)])['1']).toBeUndefined();
    expect(anon.current.getFormPrefillData(FORM_SLUG, [buildField(1)])['1']).toBeUndefined();
    expect(userA.current.getFormPrefillData(FORM_SLUG, [buildField(1)])['1']?.value).toBe('from-a');
  });

  it('discards legacy flat-shape data instead of exposing it to anonymous visitors', () => {
    // Simulate a browser that saved data before per-viewer scoping was introduced —
    // that shared bucket could hold a previously logged-in user's answers, so it
    // must not resurface under the new anonymous scope.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [FORM_SLUG]: buildSubmissionData('legacy-value') }),
    );

    const { result } = renderHook(() => useFormPrefill());

    const prefill = result.current.getFormPrefillData(FORM_SLUG, [buildField(1)]);
    expect(prefill['1']).toBeUndefined();

    // The discard should have been persisted immediately so it doesn't re-run on every read
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(stored).toEqual({});
  });

  it('clearFormPrefillData only clears the current scope and form', () => {
    const { result: userA } = renderHook(() => useFormPrefill('user-a'));
    act(() => {
      userA.current.saveFormPrefillData(FORM_SLUG, buildSubmissionData('a-main'));
      userA.current.saveFormPrefillData(OTHER_FORM_SLUG, buildSubmissionData('a-other'));
    });

    const { result: anon } = renderHook(() => useFormPrefill());
    act(() => {
      anon.current.saveFormPrefillData(FORM_SLUG, buildSubmissionData('anon-main'));
    });

    act(() => {
      userA.current.clearFormPrefillData(FORM_SLUG);
    });

    expect(userA.current.getFormPrefillData(FORM_SLUG, [buildField(1)])['1']).toBeUndefined();
    expect(userA.current.getFormPrefillData(OTHER_FORM_SLUG, [buildField(1)])['1']?.value).toBe(
      'a-other',
    );
    expect(anon.current.getFormPrefillData(FORM_SLUG, [buildField(1)])['1']?.value).toBe(
      'anon-main',
    );
  });
});
