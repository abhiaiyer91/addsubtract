
(function(window){

'use strict';
window.Abhi =
angular
  .module('addSubtractApp', [
    'ngRoute'
  ]);

 window.Abhi.config(['$routeProvider', function ($routeProvider) {
    $routeProvider
      .when('/', {
        templateUrl: 'views/main.html',
        controller: 'MainCtrl'
      })
      .otherwise({
        redirectTo: '/'
      });
  }]);

}(window));