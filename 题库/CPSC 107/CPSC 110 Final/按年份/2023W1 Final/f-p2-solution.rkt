;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p2-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
;; DO NOT PUT ANYTHING PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2023w1-f/f-p2) ;Do not edit or remove this tag



(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line


(@htdf flip-image-chunks)
(@signature Image Natural -> Image)
;; produce given i cut into n chunks and recombined in reverse order
;; CONSTRAINT: n > 0
(check-expect (flip-image-chunks empty-image 1) empty-image)
(check-expect (flip-image-chunks empty-image 2) empty-image)
(check-expect (flip-image-chunks (circle 20 "solid" "red") 1)
              (circle 20 "solid" "red"))
(check-expect (flip-image-chunks (circle 20 "solid" "red") 4)
              (beside (crop 30 0 10 40 (circle 20 "solid" "red"))
                      (crop 20 0 10 40 (circle 20 "solid" "red"))
                      (crop 10 0 10 40 (circle 20 "solid" "red"))
                      (crop  0 0 10 40 (circle 20 "solid" "red"))))

;(define (flip-image-chunks i n) empty)

(@template-origin fn-composition use-abstract-fn)

(define (flip-image-chunks i n)
  (local [(define chunk-width (/ (image-width i) n))]
    (foldr (lambda (x y) (beside y x))
           empty-image
           (build-list n
                       (lambda (x)
                         (crop (* x chunk-width) 0
                               chunk-width (image-height i) i))))))
