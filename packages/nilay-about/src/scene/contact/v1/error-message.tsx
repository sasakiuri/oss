
import * as React from "react";
import {
    Collapse,
    IconButton
} from "@material-ui/core";
import { Alert, AlertTitle } from '@material-ui/lab';
import { Close } from "@material-ui/icons";
import styled from "styled-components";

type Props = {
    className?: string;
    visibility: boolean;
    title: string;
    message: string;
    onClick: (e: React.MouseEvent<HTMLElement>) => void;
};

const Component: React.FC<Props> = (props) => {

    return (
        <Collapse in={props.visibility} className={props.className}>
            <Alert
                severity="error"
                action={
                    <IconButton
                        aria-label="close"
                        color="inherit"
                        size="small"
                        onClick={props.onClick}
                    >
                        <Close fontSize="inherit" />
                    </IconButton>
                }
            >
                <AlertTitle>{props.title}</AlertTitle>
                <div>{props.message}</div>
            </Alert>
        </Collapse>
    );
};

const StyledComponent = styled(Component)`
    margin-top: 2rem;
    &.MuiCollapse-hidden {
        margin-top: 0;
    }
`;

export default StyledComponent;