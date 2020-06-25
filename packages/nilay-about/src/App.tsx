import React from "react";
import { BrowserRouter, Route } from "react-router-dom";
import { StylesProvider } from "@material-ui/styles";
import AppBar from "./component/app-bar/v1/app-bar";
import Footer from "./component/footer/v1/component";

import { Home } from "./view/home"
import { List as NewsList, Detail as NewsDetail } from "./view/news"
import { Contact } from "./view/contact"
import { HomeTarget } from "./view/labs"
import "./App.css";

const App: React.FC = () => {
  return (
    <StylesProvider injectFirst>
      <BrowserRouter>
        <AppBar />
        <div className="App">
          <Route exact path="/" component={Home} />
          <Route exact path="/news" component={NewsList} />
          <Route path="/news/:id" component={NewsDetail} />
          <Route path="/contact" component={Contact} />
          <Route exact path="/labs/home-target" component={HomeTarget} />
        </div>
        <Footer />
      </BrowserRouter>
    </StylesProvider>
  );
};

export default App;
