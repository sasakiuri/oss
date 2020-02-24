import React from "react";
import { BrowserRouter, Route, Link } from "react-router-dom";
import AppBar from "./component/app-bar/v1/app-bar";
import Footer from "./component/footer/v1/component";
import HomeScene from "./scene/home/v1/container";
import NewsListScene from "./scene/news-list/v1/container";
import NewsDetailScene from "./scene/news-detail/v1/container";
import ContactScene from "./scene/contact/v1/container";

import "./App.css";
import { StylesProvider } from "@material-ui/styles";

const App: React.FC = () => {
  return (
    <StylesProvider injectFirst>
      <BrowserRouter>
        <AppBar />
        <div className="App">
          <Route exact path="/" component={HomeScene} />
          <Route exact path="/news" component={NewsListScene} />
          <Route path="/news/:id" component={NewsDetailScene} />
          <Route path="/contact" component={ContactScene} />
        </div>
        <Footer />
      </BrowserRouter>
    </StylesProvider>
  );
};

export default App;
