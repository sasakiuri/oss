<template>
  <div id="app">
    <b-navbar type="light" sticky="true" class="py-0 bg-white l_navbar">
      <div class="container">
        <b-navbar-brand href="/">Nilay/About</b-navbar-brand>
        <b-nav class="mr-auto ml-2">
          <b-nav-item to="/">ご案内</b-nav-item>
        </b-nav>
      </div>
    </b-navbar>
    <router-view />

    <footer class="bg-light text-dark">
      <div class="container py-3">
        <div class="row">
          <div class="col-12 h2">
            <a href="https://www.facebook.com/NilaySport/" class="text-dark" target="_blank">
              <i class="fab fa-facebook-square"></i>
            </a>&nbsp;
            <a href="https://twitter.com/NilayJP" class="text-dark" target="_blank">
              <i class="fab fa-twitter"></i>
            </a>&nbsp;
            <a
              href="https://www.youtube.com/channel/UC03yJGn_rZV2MTpr-ZrMZrA"
              class="text-dark"
              target="_blank"
            >
              <i class="fab fa-youtube"></i>
            </a>&nbsp;
            <a href="https://www.instagram.com/NilayJP/" class="text-dark" target="_blank">
              <i class="fab fa-instagram"></i>
            </a>
          </div>
          <hr class="divider" />
          <div class="col-6 col-sm-3 text-left">
            <h5>Nilay/About</h5>
          </div>
          <div class="col-6 col-sm-3 text-left">
            <h5>サービス</h5>
            <div class="pl-3">Knowledge</div>
            <div class="pl-3">E-commerce</div>
            <div class="pl-3">Gunman</div>
          </div>
          <hr class="divider" />
          <div class="col-12 small">
            <small>© 2019 Nilay</small>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<style>
#app {
  font-family: "Roboto", "Noto Sans JP", -apple-system, BlinkMacSystemFont,
    Roboto, "游ゴシック体", YuGothic, "Yu Gothic", "Avenir", Helvetica, Arial,
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}
.l_navbar {
  box-shadow: 0 2px 2px 0 rgba(0, 0, 0, 0.14),
    0 3px 1px -2px rgba(0, 0, 0, 0.12), 0 1px 5px 0 rgba(0, 0, 0, 0.2);
}
.navbar .router-link-active {
  border-bottom: 2px solid rgb(232, 118, 0);
}
</style>
