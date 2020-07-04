import * as React from "react"
import styled from "styled-components"

type Props = {
  className?: string
  title: string
  subtitle: string
}

const Title = styled.div`
  font-size: 2rem;
  font-weight: 700;
  padding-top: 3rem;
`

const Subtitle = styled.h1`
  font-size: 1.25rem;
  font-weight: 400;
`

const Component: React.FC<Props> = (props: Props) => {
  return (
    <div className={props.className}>
      <Title>{props.title}</Title>
      <Subtitle>{props.subtitle}</Subtitle>
    </div>
  )
}

const StyledComponent = styled(Component)`
  text-align: center;
  color: #2c3e50;
  width: 100%;
`

export const BasicTitle = StyledComponent
