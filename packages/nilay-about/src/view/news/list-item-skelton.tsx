import React from "react";
import styled from "styled-components";
import {
  ListItem,
  ListItemAvatar,
  ListItemText,
  Typography
} from "@material-ui/core";
import { Skeleton } from '@material-ui/lab';
import { Announcement } from "@material-ui/icons";


type Props = {
  className?: string;
};

const Component: React.FC<Props> = (props) => {
  return (
    <React.Fragment>
      {[0, 1, 2, 3, 4, 5, 6].map((_, index: number, array: Array<number>) => {
        return (
          <ListItem
            key={index}
            button
            divider={index !== array.length - 1}
            alignItems="flex-start"
          >
            <ListItemAvatar style={{ color: "#2c3e50" }}>
              <Announcement />
            </ListItemAvatar>
            <ListItemText
              style={{ color: "#2c3e50" }}
              primary={
                <React.Fragment>
                  <Typography style={{ marginBottom: "0.5rem" }}>
                    <Skeleton variant="text" height={"32px"} />
                  </Typography>
                </React.Fragment>
              }
              secondary={
                <React.Fragment>
                  <Skeleton variant="text" />
                  <Skeleton variant="text" />
                  <Skeleton variant="text" width={"75%"} />
                </React.Fragment>
              }
            />
          </ListItem>

        );
      })}

    </React.Fragment>
  );
};

const StyledComponent = styled(Component)`
`;

export default StyledComponent;