;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p1-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2024w2-f/f-p1)

(@problem 1)

(define SCALE-FACTOR 1.414)

(@htdf square-spin)
(@signature Natural Number Color -> Image)
;; produce n overlaid enclosing squares of color c, rotating by 45 each layer
(check-expect (square-spin 4 50 "blue")
              (overlay (rotate (* 45 0)
                               (square (* 50 (expt SCALE-FACTOR 0))
                                       "outline" "blue"))
                       (rotate (* 45 1)
                               (square (* 50 (expt SCALE-FACTOR 1))
                                       "outline" "blue"))
                       (rotate (* 45 2)
                               (square (* 50 (expt SCALE-FACTOR 2))
                                       "outline" "blue"))
                       (rotate (* 45 3)
                               (square (* 50 (expt SCALE-FACTOR 3))
                                       "outline" "blue"))))
(check-expect (square-spin 5 30 "red")
              (overlay (square  30 "outline" "red")
                       (rotate  45 (square (* 30 SCALE-FACTOR) "outline" "red"))
                       (rotate  90 (square (* 30
                                              SCALE-FACTOR
                                              SCALE-FACTOR) "outline" "red"))
                       (rotate 135 (square (* 30
                                              SCALE-FACTOR
                                              SCALE-FACTOR
                                              SCALE-FACTOR) "outline" "red"))
                       (rotate 180 (square (* 30
                                              SCALE-FACTOR
                                              SCALE-FACTOR
                                              SCALE-FACTOR
                                              SCALE-FACTOR) "outline" "red"))))

;(define (square-spin n side c) empty-image) ;stub

(@template-origin fn-composition use-abstract-fn)

(define (square-spin n side c)
  (foldr overlay
         empty-image
         (build-list n
                     (lambda (i)
                       (rotate (* 45 i)
                               (square (* side (expt SCALE-FACTOR i))
                                       "outline" c))))))
