import { lastUpdated } from "../constants/lastUpdated";

export const ClientTime = () => {
  return (
    <div>
      <p>
        Last updated on <span className="tabular-nums"
          >{
            Intl.DateTimeFormat(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "numeric",
              second: "numeric",
            }).format(new Date(lastUpdated))
          }</span
        >
      </p>
    </div>
  );
};