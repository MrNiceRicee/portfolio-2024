import { lastUpdated } from "../constants/lastUpdated";

const ClientTime = () => {
  const lastUpdatedDate = Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).format(new Date(lastUpdated));

  return (
    <div>
      <p>
        last updated on <span className="tabular-nums">{
          lastUpdatedDate
        }</span>
      </p>
    </div>
  )
}

export default ClientTime;