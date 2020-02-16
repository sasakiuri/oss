import * as React from "react";
import styled from "styled-components";

interface Props {
  className?: string;
  title: string;
  subtitle: string;
}

const Title = styled.div`
  font-size: 2rem;
  font-weight: 700;
  padding-top: 3rem;
`;

const Subtitle = styled.h1`
  font-size: 1.25rem;
  font-weight: 400;
`;

class Component extends React.Component<Props> {
  public constructor(props: Props) {
    super(props);
  }

  public render(): React.ReactNode {
    return (
      <div className={this.props.className}>
        <Title>{this.props.title}</Title>
        <Subtitle>{this.props.subtitle}</Subtitle>
      </div>
    );
  }
}

const StyledComponent = styled(Component)``;

export default StyledComponent;
