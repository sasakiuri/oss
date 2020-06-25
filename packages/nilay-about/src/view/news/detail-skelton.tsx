import React from "react";
import styled from "styled-components";
import { Skeleton } from '@material-ui/lab';

type Props = {
    className?: string;
};

const Component: React.FC<Props> = (props) => {
    return (
        <React.Fragment>
            <Skeleton variant="text" width={"25%"} style={{ marginBottom: "1rem", marginTop: "3rem" }} />
            <Skeleton variant="text" height={"52px"} width={"66%"} style={{ marginBottom: "3rem" }} />
            <Skeleton variant="text" />
            <Skeleton variant="text" />
            <Skeleton variant="text" />
            <Skeleton variant="text" width={"33%"} />
            <Skeleton variant="text" />
            <Skeleton variant="text" />
            <Skeleton variant="text" />
            <Skeleton variant="text" width={"33%"} style={{ marginBottom: "3rem" }} />
        </React.Fragment>
    );


};

const StyledComponent = styled(Component)`
`;

export default StyledComponent;