interface AllowPromptIllustrationProps {
  /** "prompt" shows the generic allow prompt; "done" shows a connected tick. */
  state?: "prompt" | "done";
}

/**
 * A TV on the wall showing a generic "Allow ... to connect?" prompt.
 * Pure markup: an illustration of what to look for, not the TV's real UI.
 */
export default function AllowPromptIllustration({ state = "prompt" }: AllowPromptIllustrationProps) {
  return (
    <figure className="m-0 rounded-[14px] bg-wall px-4 pb-6 pt-10 sm:px-10 sm:pb-10 sm:pt-14">
      <div
        aria-hidden="true"
        className="rounded bg-bezel px-1.5 pb-4 pt-1.5 shadow-[0_22px_44px_rgba(21,23,26,0.3)] sm:px-2 sm:pb-5 sm:pt-2"
      >
        <div className="box-border flex aspect-video items-start justify-end bg-[#3A3F46] p-[5%]">
          {state === "prompt" ? (
            <div className="box-border w-[62%] rounded-md bg-[#23262B] p-2.5 text-[10px] leading-[1.4] text-white sm:w-[52%] sm:p-4 sm:text-xs">
              <p className="m-0 mb-2 sm:mb-3">
                Allow <strong>Frame TV Uploader</strong> to connect to this TV?
              </p>
              <div className="flex gap-2">
                <span className="flex-1 rounded bg-white py-1 text-center font-semibold text-ink outline outline-2 outline-offset-2 outline-[#7C9BFF] sm:py-[7px]">
                  Allow
                </span>
                <span className="flex-1 rounded bg-[#3A3F46] py-1 text-center text-white sm:py-[7px]">
                  Deny
                </span>
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white sm:h-16 sm:w-16">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1B7F4B" strokeWidth="3">
                  <path d="M5 12.5l4.5 4.5L19 7" />
                </svg>
              </span>
            </div>
          )}
        </div>
      </div>
      <figcaption className="mt-5 text-center text-xs text-muted">
        {state === "prompt" ? (
          <>
            <span className="sr-only">
              Illustration of a TV showing a prompt that asks whether to allow Frame TV Uploader to
              connect, with Allow highlighted.{" "}
            </span>
            <span aria-hidden="true">Illustration. </span>
            The prompt appears in a corner of the TV screen.
          </>
        ) : (
          <>Illustration. The TV has allowed this app.</>
        )}
      </figcaption>
    </figure>
  );
}
