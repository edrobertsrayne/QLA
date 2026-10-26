# Live parse progress

QLA does not show a progress bar, percentage, stage list or running entry count while a paper is parsed. The run dialog shows a spinner per step and tells the teacher that a parse can take a few minutes.

## Why this is out of scope

Almost all of a parse's time is one model call, which the server makes as a single non-streaming request to OpenRouter and gets back as one complete answer. While that call runs, nothing reports how far it has got, so a progress display would have nothing meaningful to show:

- **Elapsed time** only says how long the teacher has waited, not what is happening.
- **Named stages** (reading PDFs, fetching the specification, waiting for the model) spend nearly the whole wait on the last stage.
- **Real progress** means streaming the model's structured output and reading partial JSON as entries arrive. That needs a streaming mode in the shared OpenRouter transport and a streamed response from the parse route to the browser: a large change to the one transport every model call shares.

Only real progress is worth showing, and it isn't worth that change for a wait of a minute or two. A plain notice that the run can take a few minutes deals with the impatience behind the request.

If streaming arrives for another reason (for example, to stop billing when a teacher cancels a run, which OpenRouter only honours for streaming requests), revisit this.

## Prior requests

- #129: "Show progress updates while parsing an exam"
