import { useCallback, useEffect, useRef, useState } from 'react';
import { createSample } from '../model/sample';
import { importGlb } from '../model/importGlb';
import { disposeObjects } from '../model/model';

export function useModel() {
  const [model, setModel] = useState(createSample);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  useEffect(() => () => { disposeObjects(model.resources); }, [model]);
  useEffect(() => () => { request.current++; }, []);

  const openFile = useCallback(async (file: File) => {
    const ticket = ++request.current;
    setLoading(file.name);
    setError(null);
    try {
      const next = await importGlb(file);
      if (ticket !== request.current) { disposeObjects(next.resources); return; }
      setModel(next);
    } catch (problem) {
      if (ticket === request.current) setError(problem instanceof Error ? problem.message : 'The model could not be opened. Try another GLB.');
    } finally {
      if (ticket === request.current) setLoading(null);
    }
  }, []);

  const resetSample = useCallback(() => {
    request.current++;
    setLoading(null);
    setError(null);
    setModel(createSample());
  }, []);

  return { model, loading, error, setError, openFile, resetSample };
}
