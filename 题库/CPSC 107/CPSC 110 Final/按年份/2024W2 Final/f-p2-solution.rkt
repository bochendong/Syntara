;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p2-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2024w2-f/f-p2) ;Do not edit or remove this tag

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line

(@htdf render-longest)
(@signature (listof (listof String)) Number Color -> (listof Image))
;; produce a list of longest string in each sublist render w font-size and color
(check-expect (render-longest (list) 10 "blue") (list))
(check-expect (render-longest (list (list "hi" "hello" "howdy")
                                    (list "traveler" "nomad" "adventurer")
                                    (list "may" "would" "lets"))
                              20
                              "red")
              (list (text "hello" 20 "red")
                    (text "adventurer" 20 "red")
                    (text "would" 20 "red")))

;; *** Must not edit any line above here. ***

;(define (render-longest lolos font-size c) empty) ;stub

(@template-origin fn-composition use-abstract-fn)

(define (render-longest lolos font-size c)
  (local [(define (string-max a b)
            (if (>= (string-length a) (string-length b))
                a
                b))]
    (map (lambda (str)
           (text str font-size c))
         (map (lambda (los)
                (foldr string-max "" los))
              lolos))))
