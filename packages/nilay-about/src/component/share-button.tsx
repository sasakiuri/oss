import React from "react"
import { Twitter, Facebook } from "@material-ui/icons"

const IconStyle = {
  fontSize: "32px",
  display: "inline-block",
}

type Props = {
  className?: string
  title: string
  url: string
  twitter: string
}

export const Component: React.FC<Props> = (props: Props) => {
  return (
    <div className={props.className}>
      <a
        href={`https://twitter.com/share?text=${encodeURIComponent(
          props.title
        )}&url=${encodeURIComponent(props.url)}&via=${encodeURIComponent(
          props.twitter
        )}&lang=ja`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Twitter style={{ ...IconStyle, color: "#55acee" }} />
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
          props.url
        )}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Facebook
          style={{ ...IconStyle, color: "#3b5998", marginLeft: "8px" }}
        />
      </a>
    </div>
  )
}

export const ShareButton = Component
