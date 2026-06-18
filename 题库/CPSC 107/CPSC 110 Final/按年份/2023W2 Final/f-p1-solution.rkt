;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p1-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2023w2-f/f-p1) ;Do not edit or remove this tag



(@problem 1) ;do not edit or delete this line


(@htdf rectangles)
(@signature Natural Number Number Color -> Image)
;; produce n overlaid rectangles of color c, from size w, h to size h, w
;; CONSTRAINT: n is >= 2
(check-expect (rectangles 2 20 100 "blue")
              (overlay (rectangle 20  100 "outline" "blue")
                       (rectangle 100  20 "outline" "blue")))

(check-expect (rectangles 4 50 125 "red")
              (overlay (rectangle 50  125 "outline" "red")
                       (rectangle 75  100 "outline" "red")
                       (rectangle 100  75 "outline" "red")
                       (rectangle 125  50 "outline" "red")))

;(define (rectangles n w h c) empty-image) ;stub

(@template-origin fn-composition use-abstract-fn)

(define (rectangles n w0 h0 c)
  (local [(define dw (/ (- h0 w0) (sub1 n)))
          (define dh (/ (- w0 h0) (sub1 n)))]
    (foldr overlay
           empty-image
           (build-list n
                       (lambda (i)
                         (rectangle (+ w0 (* i dw))
                                    (+ h0 (* i dh))
                                    "outline"
                                    c))))))
