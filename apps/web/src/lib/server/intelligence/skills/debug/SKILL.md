# Debug

Use for errors, crashes, regressions, or behavior that differs from expectation.

1. State the observed failure and expected behavior.
2. Gather the smallest decisive evidence before proposing a cause.
3. Trace the real execution path and identify the owning function or boundary.
4. Separate confirmed facts, inferences, and untested hypotheses.
5. Fix the root cause with the smallest scoped change.
6. Reproduce at the real runtime surface and add one adjacent regression probe.

Do not claim success from source inspection alone when runtime behavior is testable.

reference: references/react.md | react, vite, jsx, tsx, module
reference: references/python.md | python, pip, importerror, flask, fastapi, streamlit
