;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p4-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)
(@assignment exams/2024w1-f/f-p4) ;Do not edit or remove this tag


(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line


(define THICKNESS 2)

(@htdf ray-star)
(@signature Number Natural Color -> Image)
;; produce a 'ray-star' with the given number of lines, line length and color
(check-expect (ray-star 100 0 "green") empty-image)
(check-expect (ray-star 100 3 "red")
              (overlay (rotate   0 (rectangle 100 THICKNESS "solid" "red"))
                       (rotate 120 (rectangle 100 THICKNESS "solid" "red"))
                       (rotate 240 (rectangle 100 THICKNESS "solid" "red"))))
(check-expect (ray-star 200 5 "red")
              (local [(define l (rectangle 200 THICKNESS "solid" "red"))]
                (overlay (rotate   0 l)
                         (rotate (* 360 1/5) l)
                         (rotate (* 360 2/5) l)
                         (rotate (* 360 3/5) l)
                         (rotate (* 360 4/5) l))))

(@template-origin fn-composition use-abstract-fn)

(define (ray-star diam n-rays color)
  (local [(define line (rectangle diam THICKNESS "solid" color))]
    (foldr overlay empty-image
           (map (lambda (theta) (rotate theta line))
                (build-list n-rays (lambda (i) (* i (/ 360 n-rays))))))))
