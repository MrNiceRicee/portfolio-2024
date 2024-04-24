import { lastUpdated } from "../constants/lastUpdated";

const ClientTime = () => {

  return (
    <div>
      <p>
         last updated on <span className="tabular-nums">{
          Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
          }).format(new Date(lastUpdated))
        }</span>
      </p>
    </div>
  )
}

export default ClientTime;