<template>
  <div class="home">
    <a target="_blank" href="https://www.irasutoya.com/2015/03/blog-post_346.html"><img alt="Vue logo" src="../assets/0db7cad9ab39158b8ca1e2c3dd3e144dfa67c852.png" /></a>
    <div class="h1">ようこそ！！</div>
    <div class="container">

      <div class="row">
        <div class="col-12">
          <h2>サービス</h2>
        </div>
        <div class="col-12 col-md-4 my-5">
          <div>
            <i class="fas fa-book text-black-50"></i>
          </div>
          <h3 class="text-black-50">Knowledge</h3>
          <p class="text-left">銃・射撃・狩猟に関する知識を紹介しています。</p>
          <b-button variant="outline-dark" href="https://knowledge.nilay.jp" target="_blank">読む</b-button>
        </div>
        <div class="col-12 col-md-4 my-5">
          <div>
            <i class="fas fa-shopping-cart text-black-50"></i>
          </div>
          <h3 class="text-black-50">E-commerce</h3>
          <p class="text-left">射撃用品・狩猟用品・鳥獣被害対策用品を販売しています。</p>
          <b-button variant="outline-dark" href="https://www.nilay.jp" target="_blank">買う</b-button>
        </div>
        <div class="col-12 col-md-4 my-5">
          <div>
            <i class="fas fa-cloud text-black-50"></i>
          </div>
          <h3 class="text-black-50">Gunman</h3>
          <p class="text-left">申請書・申込書・各種添付書類を作成することができます。</p>
          <b-button variant="outline-dark" disabled >工事中</b-button>
        </div>
      </div>

      <div class="row my-5">
        <div class="col-12 col-md-4">
          <h2>お問い合わせ</h2>
          <div>
            <i class="fas fa-envelope"></i>&nbsp;contact@mail.nilay.jp
          </div>
          <div>
            <i class="fas fa-phone"></i>&nbsp;080-7059-1382
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script>
// @ is an alias to /src
// import HelloWorld from '@/components/HelloWorld.vue'

export default {
  name: "home"
  // components: {
  //   HelloWorld
  // }
};
</script>
